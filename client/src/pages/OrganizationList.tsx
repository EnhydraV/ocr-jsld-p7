import { useOrganizations, useDeleteOrganization } from '../hooks/useOrganizations';
import Card from '../components/Card';
import { Link } from 'react-router-dom';

export default function OrganizationList() {
  const { data: organizations, isLoading, error } = useOrganizations();
  const deleteOrganization = useDeleteOrganization();

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this organization?')) {
      try {
        await deleteOrganization.mutateAsync(id);
      } catch (_err) {
        alert('Failed to delete organization');
      }
    }
  };

  if (isLoading) {
    return <div className="text-center py-12">Loading organizations...</div>;
  }

  if (error) {
    return <div className="text-center py-12 text-red-600">Error loading organizations</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
        <Link
          to="/organizations/new"
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition"
        >
          Add Organization
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {organizations && organizations.length > 0 ? (
          organizations.map((org) => (
            <Card key={org.id}>
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">{org.name}</h3>
                {org.industry && (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">Industry:</span> {org.industry}
                  </p>
                )}
                {org.website && (
                  <p className="text-sm text-gray-500">
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      {org.website}
                    </a>
                  </p>
                )}
                {org.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">{org.description}</p>
                )}
                <div className="text-sm text-gray-500">
                  <span className="font-medium">Contacts:</span> {org.contacts?.length || 0}
                </div>
                <div className="flex justify-end space-x-2 pt-2 border-t">
                  <Link
                    to={`/organizations/${org.id}/edit`}
                    className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(org.id)}
                    className="text-red-600 hover:text-red-900 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="col-span-full">
            <p className="text-center text-gray-500">
              No organizations found. Create your first organization to get started.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
