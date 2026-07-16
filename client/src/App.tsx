import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ContactList from './pages/ContactList';
import ContactForm from './pages/ContactForm';
import OrganizationList from './pages/OrganizationList';
import OrganizationForm from './pages/OrganizationForm';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/new" element={<ContactForm />} />
            <Route path="/contacts/:id/edit" element={<ContactForm />} />
            <Route path="/organizations" element={<OrganizationList />} />
            <Route path="/organizations/new" element={<OrganizationForm />} />
            <Route path="/organizations/:id/edit" element={<OrganizationForm />} />
            <Route path="*" element={<div className="text-center py-12">Page not found</div>} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
