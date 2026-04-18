import { createBrowserRouter, Navigate } from 'react-router-dom'
import { HomeownerLayout } from '@/components/layout/homeowner-layout'
import { VendorLayout } from '@/components/layout/vendor-layout'
import { AdminLayout } from '@/components/layout/admin-layout'
import { RequireAuth } from '@/router/require-auth'

// Auth
import { LoginPage } from '@/features/auth/pages/login'
import { RegisterPage } from '@/features/auth/pages/register'

// Homeowner (named exports)
import { HomeownerHome } from '@/features/homeowner/pages/home'
import { VendorComparePage } from '@/features/homeowner/pages/vendor-compare'
import { BookingCalendarPage } from '@/features/homeowner/pages/booking-calendar'
import { BookingConfirmationPage } from '@/features/homeowner/pages/booking-confirmation'
import { AppointmentStatusPage } from '@/features/homeowner/pages/appointment-status'
import { HomeownerMessagesPage } from '@/features/homeowner/pages/messages'
import { HomeownerProfilePage } from '@/features/homeowner/pages/profile'
import { ServiceDetailPage } from '@/features/homeowner/pages/service-detail'
import { CartPage } from '@/features/homeowner/pages/cart'

// Vendor (default exports)
import VendorDashboard from '@/features/vendor/pages/dashboard'
import LeadInbox from '@/features/vendor/pages/lead-inbox'
import VendorCalendar from '@/features/vendor/pages/calendar'
import VendorCatalog from '@/features/vendor/pages/catalog'
import VendorBanking from '@/features/vendor/pages/banking'
import VendorMessages from '@/features/vendor/pages/messages'
import VendorProfile from '@/features/vendor/pages/profile'

// Admin (default exports)
import OverviewPage from '@/features/admin/pages/overview'
import RevenuePage from '@/features/admin/pages/revenue'
import VendorsPage from '@/features/admin/pages/vendors'
import TransactionsPage from '@/features/admin/pages/transactions'
import BankingPage from '@/features/admin/pages/banking'
import SettingsPage from '@/features/admin/pages/settings'
import BugsPage from '@/features/admin/pages/bugs'
import ProductsAdminPage from '@/features/admin/pages/products'
import UsersPage from '@/features/admin/pages/users'
import HomeownersPage from '@/features/admin/pages/homeowners'
import AdminProfilePage from '@/features/admin/pages/profile'
import WorkflowPage from '@/features/admin/pages/workflow'
import ReportsPage from '@/features/admin/pages/reports'
import AdminMessagesPage from '@/features/admin/pages/messages'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  {
    path: '/home',
    element: <HomeownerLayout />,
    children: [
      { index: true, element: <HomeownerHome /> },
      { path: 'service/:serviceId', element: <ServiceDetailPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'vendor-compare', element: <VendorComparePage /> },
      { path: 'booking', element: <BookingCalendarPage /> },
      { path: 'booking/confirmed', element: <BookingConfirmationPage /> },
      { path: 'appointments/:id', element: <AppointmentStatusPage /> },
      { path: 'messages', element: <HomeownerMessagesPage /> },
      { path: 'profile', element: <HomeownerProfilePage /> },
    ],
  },

  {
    path: '/vendor',
    element: <RequireAuth><VendorLayout /></RequireAuth>,
    children: [
      { index: true, element: <VendorDashboard /> },
      { path: 'leads', element: <LeadInbox /> },
      { path: 'calendar', element: <VendorCalendar /> },
      { path: 'catalog', element: <VendorCatalog /> },
      { path: 'banking', element: <VendorBanking /> },
      { path: 'messages', element: <VendorMessages /> },
      { path: 'profile', element: <VendorProfile /> },
    ],
  },

  {
    path: '/admin',
    element: <RequireAuth><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'revenue', element: <RevenuePage /> },
      { path: 'vendors', element: <VendorsPage /> },
      { path: 'messages', element: <AdminMessagesPage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'banking', element: <BankingPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'bugs', element: <BugsPage /> },
      { path: 'workflow', element: <WorkflowPage /> },
      { path: 'products', element: <ProductsAdminPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'homeowners', element: <HomeownersPage /> },
      { path: 'profile', element: <AdminProfilePage /> },
    ],
  },
])
