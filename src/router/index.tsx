import { createBrowserRouter, Navigate } from 'react-router-dom'
import { HomeownerLayout } from '@/components/layout/homeowner-layout'
import { VendorLayout } from '@/components/layout/vendor-layout'
import { AdminLayout } from '@/components/layout/admin-layout'
import { RequireAuth } from '@/router/require-auth'
import { RequireActiveMembership } from '@/router/require-active-membership'
import { RootLayout } from '@/router/root-layout'

// Auth
import { LoginPage } from '@/features/auth/pages/login'
import { RegisterPage } from '@/features/auth/pages/register'

// Misc
import { NotFoundPage } from '@/features/misc/pages/not-found'

// Homeowner (named exports)
import { HomeownerHome } from '@/features/homeowner/pages/home'
import { VendorComparePage } from '@/features/homeowner/pages/vendor-compare'
import { BookingCalendarPage } from '@/features/homeowner/pages/booking-calendar'
import { BookingConfirmationPage } from '@/features/homeowner/pages/booking-confirmation'
import { AppointmentStatusPage } from '@/features/homeowner/pages/appointment-status'
import { HomeownerMessagesPage } from '@/features/homeowner/pages/messages'
import { HomeownerProfilePage } from '@/features/homeowner/pages/profile'
import { HomeownerTutorialsPage } from '@/features/homeowner/pages/tutorials'
import { ServiceDetailPage } from '@/features/homeowner/pages/service-detail'
import { CartPage } from '@/features/homeowner/pages/cart'

// Vendor (default exports)
import VendorDashboard from '@/features/vendor/pages/dashboard'
import LeadInbox from '@/features/vendor/pages/lead-inbox'
import VendorCalendar from '@/features/vendor/pages/calendar'
import VendorCatalog from '@/features/vendor/pages/catalog'
import VendorBanking from '@/features/vendor/pages/banking'
import VendorMembership from '@/features/vendor/pages/membership'
import VendorMessages from '@/features/vendor/pages/messages'
import VendorProfile from '@/features/vendor/pages/profile'
import VendorEmployeesPage from '@/features/vendor/pages/employees'

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
import EmployeesPage from '@/features/admin/pages/employees'
import AdminProfilePage from '@/features/admin/pages/profile'
import WorkflowPage from '@/features/admin/pages/workflow'
import ReportsPage from '@/features/admin/pages/reports'
import AdminMessagesPage from '@/features/admin/pages/messages'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage />, handle: { title: 'Sign in' } },
      { path: '/register', element: <RegisterPage />, handle: { title: 'Create account' } },

      {
        path: '/home',
        element: <RequireAuth><HomeownerLayout /></RequireAuth>,
        handle: { title: 'Home' },
        children: [
          { index: true, element: <HomeownerHome /> },
          // service-detail sets a dynamic title (service name) via useDocumentTitle
          { path: 'service/:serviceId', element: <ServiceDetailPage /> },
          { path: 'cart', element: <CartPage />, handle: { title: 'Cart' } },
          { path: 'vendor-compare', element: <VendorComparePage />, handle: { title: 'Compare contractors' } },
          { path: 'booking', element: <BookingCalendarPage />, handle: { title: 'Book a site visit' } },
          { path: 'booking/confirmed', element: <BookingConfirmationPage />, handle: { title: 'Booking confirmed' } },
          // appointment-status may set a dynamic title later; falls back to static here
          { path: 'appointments/:id', element: <AppointmentStatusPage />, handle: { title: 'Appointment' } },
          { path: 'tutorials', element: <HomeownerTutorialsPage />, handle: { title: 'Tutorials' } },
          { path: 'messages', element: <HomeownerMessagesPage />, handle: { title: 'Messages' } },
          { path: 'profile', element: <HomeownerProfilePage />, handle: { title: 'Profile' } },
        ],
      },

      {
        path: '/vendor',
        // Ship #181 — cancelled-membership guard nested inside RequireAuth.
        // Login gate runs first; active-membership gate runs second and
        // redirects every /vendor/* except /vendor/membership to the
        // membership page when status=cancelled.
        element: (
          <RequireAuth>
            <RequireActiveMembership>
              <VendorLayout />
            </RequireActiveMembership>
          </RequireAuth>
        ),
        handle: { title: 'Vendor · Dashboard' },
        children: [
          { index: true, element: <VendorDashboard /> },
          { path: 'leads', element: <LeadInbox />, handle: { title: 'Vendor · Leads' } },
          // /vendor/projects alias for apollo probe + any UI surface that
          // labels the leads bucket as Projects (sidebar label-to-URL
          // intuition). /vendor/leads is canonical; both render LeadInbox.
          { path: 'projects', element: <LeadInbox />, handle: { title: 'Vendor · Projects' } },
          { path: 'calendar', element: <VendorCalendar />, handle: { title: 'Vendor · Calendar' } },
          { path: 'catalog', element: <VendorCatalog />, handle: { title: 'Vendor · Products' } },
          { path: 'banking', element: <VendorBanking />, handle: { title: 'Vendor · Banking' } },
          { path: 'employees', element: <VendorEmployeesPage />, handle: { title: 'Vendor · Employees' } },
          { path: 'membership', element: <VendorMembership />, handle: { title: 'Vendor · Membership' } },
          { path: 'messages', element: <VendorMessages />, handle: { title: 'Vendor · Messages' } },
          { path: 'profile', element: <VendorProfile />, handle: { title: 'Vendor · Profile' } },
        ],
      },

      {
        path: '/admin',
        element: <RequireAuth><AdminLayout /></RequireAuth>,
        handle: { title: 'Admin · Overview' },
        children: [
          { index: true, element: <OverviewPage /> },
          // /admin/overview alias for apollo probe + any stale bookmarks
          // that point to the explicit overview path. /admin (index) is
          // the canonical route; /admin/overview renders the same element.
          { path: 'overview', element: <OverviewPage />, handle: { title: 'Admin · Overview' } },
          { path: 'revenue', element: <RevenuePage />, handle: { title: 'Admin · Revenue' } },
          { path: 'vendors', element: <VendorsPage />, handle: { title: 'Admin · Vendors' } },
          { path: 'employees', element: <EmployeesPage />, handle: { title: 'Admin · Employees' } },
          { path: 'messages', element: <AdminMessagesPage />, handle: { title: 'Admin · Messages' } },
          { path: 'transactions', element: <TransactionsPage />, handle: { title: 'Admin · Transactions' } },
          { path: 'reports', element: <ReportsPage />, handle: { title: 'Admin · Reports' } },
          { path: 'banking', element: <BankingPage />, handle: { title: 'Admin · Banking' } },
          { path: 'settings', element: <SettingsPage />, handle: { title: 'Admin · Settings' } },
          { path: 'bugs', element: <BugsPage />, handle: { title: 'Admin · Bug tracker' } },
          { path: 'workflow', element: <WorkflowPage />, handle: { title: 'Admin · Workflow' } },
          { path: 'products', element: <ProductsAdminPage />, handle: { title: 'Admin · Products' } },
          { path: 'users', element: <UsersPage />, handle: { title: 'Admin · Users' } },
          { path: 'homeowners', element: <HomeownersPage />, handle: { title: 'Admin · Homeowners' } },
          { path: 'profile', element: <AdminProfilePage />, handle: { title: 'Admin · Profile' } },
        ],
      },

      // Catchall — branded 404 for any unmatched path (b-002 fix).
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
