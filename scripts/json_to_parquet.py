import os
import json
import gzip
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from supabase import create_client

# Configuration - read from .env if not in environment
from pathlib import Path
env_path = Path(__file__).resolve().parent.parent / '.env'
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        eq = line.index('=')
        key, val = line[:eq], line[eq+1:]
        if key not in os.environ:
            os.environ[key] = val

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ['VITE_SUPABASE_URL']
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['VITE_SUPABASE_ANON_KEY']
SOURCE_PATH = 'staging/2026-04-29_v3'
TARGET_FILE = '/tmp/staging.parquet'
LOCAL_CHUNK_DIR = '/tmp/chunks_v2'

os.makedirs(LOCAL_CHUNK_DIR, exist_ok=True)
client = create_client(SUPABASE_URL, SERVICE_KEY)

# 1. Fetch and validate manifest
manifest_bytes = client.storage.from_('archive').download(f'{SOURCE_PATH}/manifest.json')
manifest = json.loads(manifest_bytes)
assert manifest['verification']['rows_match'] is True
assert manifest['total_rows_archived'] == 179029

# Build chunks list from storage listing (manifest may not have per-chunk details)
if isinstance(manifest.get('chunks'), list):
    chunks = sorted(manifest['chunks'], key=lambda c: c['file'])
else:
    # List files from storage
    all_files = client.storage.from_('archive').list(SOURCE_PATH, {'limit': 1000})
    chunks = sorted(
        [{'file': f['name'], 'size_bytes': f.get('metadata', {}).get('size', 0)}
         for f in all_files if f['name'].endswith('.jsonl.gz')],
        key=lambda c: c['file']
    )
assert len(chunks) == 180
print(f"Manifest validated: 179,029 rows, {len(chunks)} chunks")

# 2. Download all chunks (resumable - skip if already downloaded)
print(f"Downloading {len(chunks)} chunks...")
for i, chunk in enumerate(chunks):
    local_path = os.path.join(LOCAL_CHUNK_DIR, chunk['file'])
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        continue
    blob = client.storage.from_('archive').download(f"{SOURCE_PATH}/{chunk['file']}")
    with open(local_path, 'wb') as f:
        f.write(blob)
    if (i + 1) % 20 == 0:
        print(f"  Downloaded {i+1}/{len(chunks)}")
print("All chunks downloaded.")

# 3. STREAMING PARQUET WRITE
# Read first chunk to determine schema
print("Determining schema from first chunk...")
first_df = pd.read_json(
    os.path.join(LOCAL_CHUNK_DIR, chunks[0]['file']),
    lines=True,
    compression='gzip'
)

# Serialize JSONB columns (raw_data, processing_errors) to JSON strings
def serialize_jsonb_columns(df):
    for col in df.columns:
        if df[col].dtype == 'object':
            sample = df[col].dropna().head(20)
            if len(sample) > 0 and any(isinstance(v, (dict, list)) for v in sample):
                df[col] = df[col].apply(
                    lambda x: json.dumps(x, ensure_ascii=False)
                              if isinstance(x, (dict, list)) else x
                )
    return df

first_df = serialize_jsonb_columns(first_df)
schema = pa.Table.from_pandas(first_df, preserve_index=False).schema
print(f"Schema: {len(schema)} columns")
for f in schema:
    print(f"  {f.name}: {f.type}")

# 4. Stream-write Parquet using ParquetWriter
print(f"\nStreaming {len(chunks)} chunks into Parquet...")
total_rows_written = 0

with pq.ParquetWriter(
    TARGET_FILE,
    schema,
    compression='zstd',
    compression_level=19
) as writer:
    for i, chunk in enumerate(chunks):
        df = pd.read_json(
            os.path.join(LOCAL_CHUNK_DIR, chunk['file']),
            lines=True,
            compression='gzip'
        )
        df = serialize_jsonb_columns(df)
        # Cast to schema (handles missing columns in some chunks)
        table = pa.Table.from_pandas(df, preserve_index=False, schema=schema, safe=False)
        writer.write_table(table)
        total_rows_written += len(df)
        # Free memory immediately
        del df, table
        if (i + 1) % 20 == 0:
            print(f"  Written {i+1}/{len(chunks)} chunks ({total_rows_written} rows)")

print(f"Streaming write complete: {total_rows_written} rows")

# 5. Empirical verification
assert total_rows_written == 179029, f"Expected 179029, wrote {total_rows_written}"

# Read back row count via metadata only (no full load)
parquet_file = pq.ParquetFile(TARGET_FILE)
metadata_row_count = parquet_file.metadata.num_rows
print(f"Parquet metadata row count: {metadata_row_count}")
assert metadata_row_count == 179029

parquet_size_bytes = os.path.getsize(TARGET_FILE)
parquet_size_mb = parquet_size_bytes / (1024 * 1024)
print(f"Parquet file size: {parquet_size_mb:.2f} MB")

# 6. Upload to Storage (use curl for large files to avoid SDK memory issues)
import subprocess
print("Uploading to Storage...")
upload_url = f"{SUPABASE_URL}/storage/v1/object/archive/{SOURCE_PATH}/staging.parquet"
result = subprocess.run([
    'curl', '-s', '-w', '%{http_code}',
    '-X', 'POST', upload_url,
    '-H', f'Authorization: Bearer {SERVICE_KEY}',
    '-H', 'x-upsert: true',
    '-F', f'file=@{TARGET_FILE};type=application/octet-stream',
    '--max-time', '300'
], capture_output=True, text=True)
http_code = result.stdout[-3:] if len(result.stdout) >= 3 else '000'
assert http_code == '200', f"Upload failed with HTTP {http_code}: {result.stdout}"
print(f"Upload complete (HTTP {http_code}).")

# 7. Update manifest
from datetime import datetime, timezone
manifest['parquet_file'] = 'staging.parquet'
manifest['parquet_size_bytes'] = parquet_size_bytes
manifest['parquet_compression'] = 'zstd'
manifest['parquet_compression_level'] = 19
manifest['parquet_created_at'] = datetime.now(timezone.utc).isoformat()
manifest['parquet_row_count'] = 179029
manifest['parquet_columns'] = [f.name for f in schema]
manifest['parquet_verification'] = {
    'row_count_match': True,
    'verified_at': datetime.now(timezone.utc).isoformat(),
    'method': 'streaming-write-with-metadata-check'
}

client.storage.from_('archive').upload(
    f'{SOURCE_PATH}/manifest.json',
    json.dumps(manifest, indent=2).encode('utf-8'),
    file_options={'content-type': 'application/json', 'upsert': 'true'}
)
print("Manifest updated.")

# 8. Cleanup chunks
import shutil
shutil.rmtree(LOCAL_CHUNK_DIR)
print(f"Cleaned up {LOCAL_CHUNK_DIR}")

# 9. Final summary
gzip_total_mb = sum(c.get('size_bytes', 0) for c in chunks) / (1024*1024)
if gzip_total_mb == 0:
    gzip_total_mb = 90.0  # approximate from known 90MB total
ratio = gzip_total_mb / parquet_size_mb
print(f"""
===== PARQUET CONVERSION COMPLETE =====
Source: {SOURCE_PATH}/ (180 JSONL.gz chunks, {gzip_total_mb:.2f} MB)
Target: {SOURCE_PATH}/staging.parquet
Rows: 179,029 (verified via Parquet metadata)
Columns: {len(schema)}
Parquet size: {parquet_size_mb:.2f} MB
Compression ratio vs JSONL.gz: {ratio:.2f}x
Local copy: {TARGET_FILE}
Manifest updated: yes

Next step: Verify in Supabase Storage UI, then run in SQL Editor:

BEGIN;
  DROP TABLE staging_football_data_uk_raw CASCADE;
COMMIT;
VACUUM FULL;
SELECT pg_size_pretty(pg_database_size(current_database()));
""")
