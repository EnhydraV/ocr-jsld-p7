import { useContactStats } from '../hooks/useContacts';
import { useOrganizationStats } from '../hooks/useOrganizations';
import Card from '../components/Card';

export default function Dashboard() {
  const { data: contactStats, isLoading: contactsLoading } = useContactStats();
  const { data: orgStats, isLoading: orgsLoading } = useOrganizationStats();

  if (contactsLoading || orgsLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
              <svg
                className="h-8 w-8 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div className="ml-5">
              <p className="text-sm font-medium text-gray-500">Total Contacts</p>
              <p className="text-2xl font-semibold text-gray-900">{contactStats?.total || 0}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div className="ml-5">
              <p className="text-sm font-medium text-gray-500">Total Organizations</p>
              <p className="text-2xl font-semibold text-gray-900">{orgStats?.total || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Welcome to Orion CRM">
        <p className="text-gray-600">
          This Customer Relationship Management system helps you manage your contacts and
          organizations efficiently.
        </p>
        <div className="mt-4 space-y-2">
          <h3 className="font-semibold text-gray-900">Features:</h3>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            <li>Manage contacts and their information</li>
            <li>Organize companies and track relationships</li>
            <li>Link contacts to their organizations</li>
            <li>View statistics and insights</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
