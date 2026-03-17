import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import CustomerLookup from './pages/CustomerLookup';
import CustomerProfile from './pages/CustomerProfile';
import CustomerStats from './pages/CustomerStats';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AdminLayout from './layouts/AdminLayout';
import CustomerLayout from './layouts/CustomerLayout';
import Dashboard from './pages/admin/Dashboard';
import Users from './pages/admin/Users';
import Profile from './pages/admin/Profile';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <CustomerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CustomerLookup />} />
            <Route path="profile" element={<CustomerProfile />} />
            <Route path="stats" element={<CustomerStats />} />
          </Route>
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
