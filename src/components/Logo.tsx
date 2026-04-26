import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  linkTo?: string;
  showText?: boolean;
}

const sizes = {
  sm: { width: 32, height: 32, textClass: 'text-base' },
  md: { width: 120, height: 40, textClass: 'text-xl' },
  lg: { width: 400, height: 120, textClass: 'text-4xl' },
};

function LogoMark({ width, height }: { width: number; height: number }) {
  return (
    <svg
      viewBox="0 0 120 40"
      width={width}
      height={height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Next59 logo"
    >
      {/* N letterform */}
      <path
        d="M4 34V6h5l14 20V6h4.5v28H23L9 14v20z"
        fill="#d4af37"
      />
      {/* 5 letterform */}
      <path
        d="M38 6h16v4.5H42.5v7h9q3.5 0 5.5 2.2t2 5.8q0 3.8-2.5 6T51 34H43v-4.5h8q2 0 3.2-1.3t1.2-3.2q0-2-1.2-3.2T51 20.5h-13z"
        fill="#d4af37"
      />
      {/* 9 letterform */}
      <path
        d="M68 6h8q4.5 0 7 2.8t2.5 7.2q0 3.5-1.5 6L77 34h-5.5l6.5-11q-1 .5-2.5.5h-3q-4 0-6.5-2.8T64 14q0-4.5 2.5-6.8T73 4.5zm5 4q-2.5 0-4 1.8T67.5 16q0 2.5 1.5 4t4 1.5 4-1.5 1.5-4-1.5-4.3T73 10z"
        fill="#d4af37"
      />
      {/* Stadium arch */}
      <path
        d="M2 36q28 6 56 6t58-6"
        stroke="#d4af37"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export default function Logo({ size = 'md', linkTo = '/', showText = false }: LogoProps) {
  const { width, height, textClass } = sizes[size];

  const content = (
    <span className="flex items-center gap-2 group">
      <LogoMark width={width} height={height} />
      {showText && (
        <span className={`font-display font-bold text-white ${textClass} tracking-tight group-hover:text-gold-400 transition-colors`}>
          Next59
        </span>
      )}
    </span>
  );

  if (linkTo) {
    return <Link to={linkTo} className="inline-flex">{content}</Link>;
  }

  return content;
}
