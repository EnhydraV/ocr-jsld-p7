import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrganization, useCreateOrganization, useUpdateOrganization } from '../hooks/useOrganizations';
import Card from '../components/Card';

export default function OrganizationForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: organization, isLoading: isLoadingOrg } = useOrganization(id ?? '');
  const createOrganization = useCreateOrganization();
  const updateOrganization = useUpdateOrganization();

  const [form, setForm] = useState({
    name: '',
    industry: '',
    website: '',
    description: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (organization) {
      setForm({
        name: organization.name,
        industry: organization.industry ?? '',
        website: organization.website ?? '',
        description: organization.description ?? '',
      });
    }
  }, [organization]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const input = {
      name: form.name,
      industry: form.industry || undefined,
      website: form.website || undefined,
      description: form.description || undefined,
    };

    try {
      if (isEdit) {
        await updateOrganization.mutateAsync({ id: id!, input });
      } else {
        await createOrganization.mutateAsync(input);
      }
      navigate('/organizations');
    } catch {
      setError('Failed to save organization. Please try again.');
    }
  };

  if (isEdit && isLoadingOrg) {
    return <div className="text-center py-12">Loading organization...</div>;
  }

  const isPending = createOrganization.isPending || updateOrganization.isPending;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">
        {isEdit ? 'Edit Organization' : 'Add Organization'}
      </h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <input
              type="text"
              name="industry"
              value={form.industry}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input
              type="url"
              name="website"
              value={form.website}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/organizations')}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 transition disabled:opacity-50"
            >
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Organization'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
