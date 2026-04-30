import { useAuth } from '../contexts/AuthContext';

export default function AuthDebugPage() {
  const { user, profile, isAdmin, loading } = useAuth();

  const row = (label: string, value: unknown) => (
    <tr key={label} className="border-b border-gray-100">
      <td className="py-2 pr-6 text-sm font-medium text-gray-500 w-56">{label}</td>
      <td className="py-2 text-sm font-mono text-gray-900 break-all">
        {value === null ? <span className="text-red-500">null</span>
          : value === undefined ? <span className="text-red-500">undefined</span>
          : value === true ? <span className="text-green-600">true</span>
          : value === false ? <span className="text-red-500">false</span>
          : String(value)}
      </td>
    </tr>
  );

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Auth Debug</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <tbody className="divide-y divide-gray-100">
            {row('loading', loading)}
            {row('user exists', user != null)}
            {row('user.id', user?.id)}
            {row('user.email', user?.email)}
            {row('app_metadata.role', user?.app_metadata?.role)}
            {row('profile loaded', profile != null)}
            {row('profile.id', profile?.id)}
            {row('profile.email', profile?.email)}
            {row('profile.role', profile?.role)}
            {row('profile.is_active', (profile as Record<string, unknown> | null)?.is_active)}
            {row('isAdmin', isAdmin)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
