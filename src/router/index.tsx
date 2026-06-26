import { createBrowserRouter, Navigate } from 'react-router-dom'
import { HomeownerLayout } from '@/components/layout/homeowner-layout'
import { VendorLayout } from '@/components/layout/vendor-layout'
import { AdminLayout } from '@/components/layout/admin-layout'
import { RequireAuth } from '@/router/require-auth'
import { RequireRole } from '@/router/require-role'
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
import { HomeownerDocumentsPage } from '@/features/homeowner/pages/documents'
import { ServiceDetailPage } from '@/features/homeowner/pages/service-detail'
import { CartPage } from '@/features/homeowner/pages/cart'
// Concierge "Request a Rep" — homeowner-facing intake + status pages.
// Components owned by phaethon (commit 3+); commit 1 wires routes
// against placeholder shells so admin shell + role gating can land
// independent of component scaffolding.
import RepRequestIntakePage from '@/features/homeowner/pages/rep-request-intake'
import RepRequestStatusPage from '@/features/homeowner/pages/rep-request-status'

// Financing (Phase-2, dark behind feature_flags.financing_enabled DB row
// read via useFeatureFlag('financing_enabled') — pages internally redirect
// to /home when the flag is off, so a leaked deep-link can't reveal the
// surface in production).
import { FinancingApplyPage } from '@/features/financing/pages/apply'
import { FinancingStatusPage } from '@/features/financing/pages/status'
import { FinancingDrawApprovePage } from '@/features/financing/pages/draw-approve'

// Vendor (default exports)
import VendorDashboard from '@/features/vendor/pages/dashboard'
import VendorLeadWorkflow from '@/features/vendor/pages/lead-workflow'
import LeadInbox from '@/features/vendor/pages/lead-inbox'
import VendorCalendar from '@/features/vendor/pages/calendar'
import VendorCatalog from '@/features/vendor/pages/catalog'
import VendorBanking from '@/features/vendor/pages/banking'
import VendorMembership from '@/features/vendor/pages/membership'
import VendorMessages from '@/features/vendor/pages/messages'
import VendorProfile from '@/features/vendor/pages/profile'
import VendorEmployeesPage from '@/features/vendor/pages/employees'
import VendorAccountRepsPage from '@/features/vendor/pages/account-reps'
import VendorSettingsPage from '@/features/vendor/pages/settings'
import VendorHomeowners from '@/features/vendor/pages/homeowners'
import VendorHomeownerDetail from '@/features/vendor/pages/homeowner-detail'
import VendorReportsPage from '@/features/vendor/pages/reports'
import VendorPermitsPage from '@/features/vendor/pages/permits'
import VendorFinancingPage from '@/features/vendor/pages/financing'

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
import ReviewsPage from '@/features/admin/pages/reviews'
import AdminHomeownerDetail from '@/features/admin/pages/homeowner-detail'
import AdminVendorDetail from '@/features/admin/pages/vendor-detail'
import EmployeesPage from '@/features/admin/pages/employees'
import AdminProfilePage from '@/features/admin/pages/profile'
import WorkflowPage from '@/features/admin/pages/workflow'
import ReportsPage from '@/features/admin/pages/reports'
import AdminMessagesPage from '@/features/admin/pages/messages'
import AdminSupportPage from '@/features/admin/pages/support'
import AdminTutorialsPage from '@/features/admin/pages/tutorials'
import AdminActivityPage from '@/features/admin/pages/activity'
import AdminFinancingPage from '@/features/admin/pages/financing'
import AdminFinancingApplicationDetail from '@/features/admin/pages/financing-application-detail'
import AdminReferralProgramPage from '@/features/admin/pages/referral-program'
import AdminModerationPage from '@/features/admin/pages/moderation'
// Concierge "Request a Rep" — admin god-view queue + rep-scoped
// "mine" queue. rep queue lives at /admin/rep-requests/mine and is
// gated by a separate RequireRole block (roles=['rep','admin'])
// nested below the admin route element so admin permission-set
// remains a strict SUPERSET of rep (PURE-SEPARATE role enum, no
// junction).
import RepRequestsPage from '@/features/admin/pages/rep-requests'
import RepRequestsMinePage from '@/features/admin/pages/rep-requests-mine'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage />, handle: { title: 'Sign in' } },
      { path: '/register', element: <RegisterPage />, handle: { title: 'Create account' } },
      // /signup alias for invite-link CTA — referral-invite edge-fn builds
      // ${appUrl}/signup?ref=<id>; alias prevents 404 on already-sent emails.
      // ?ref passes through (same URL surface); attribution capture is a
      // separate follow-up. kratos msg 1782425680242.
      { path: '/signup', element: <RegisterPage />, handle: { title: 'Create account' } },

      {
        path: '/home',
        element: (
          <RequireAuth>
            <RequireRole roles={['homeowner']}>
              <HomeownerLayout />
            </RequireRole>
          </RequireAuth>
        ),
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
          { path: 'documents', element: <HomeownerDocumentsPage />, handle: { title: 'Documents' } },
          { path: 'profile', element: <HomeownerProfilePage />, handle: { title: 'Profile' } },
          // Concierge "Request a Rep" homeowner surfaces. Intake is a
          // 3-step funnel (address+description+photos → contact+availability
          // → payment); status is the tracker page for an existing
          // rep-request row keyed by :id.
          { path: 'rep-request', element: <RepRequestIntakePage />, handle: { title: 'Request a Rep' } },
          { path: 'rep-requests/:id', element: <RepRequestStatusPage />, handle: { title: 'Rep Request' } },
          // Phase-2 financing — gated by feature_flags.financing_enabled DB
          // row at component level (Navigate to /home when off). Routes still
          // register so a flag-flip ship doesn't require a router code change.
          { path: 'financing/apply', element: <FinancingApplyPage />, handle: { title: 'Apply for financing' } },
          { path: 'financing/status/:applicationId', element: <FinancingStatusPage />, handle: { title: 'Application status' } },
          { path: 'draws/:drawId/approve', element: <FinancingDrawApprovePage />, handle: { title: 'Approve draw' } },
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
            <RequireRole roles={['vendor', 'account_rep']}>
              <RequireActiveMembership>
                <VendorLayout />
              </RequireActiveMembership>
            </RequireRole>
          </RequireAuth>
        ),
        handle: { title: 'Vendor · Dashboard' },
        children: [
          { index: true, element: <VendorDashboard /> },
          // Ship #293 — Lead Workflow tab (extracted 5-status-tile pipeline + modal).
          { path: 'lead-workflow', element: <VendorLeadWorkflow />, handle: { title: 'Vendor · Lead Workflow' } },
          { path: 'leads', element: <LeadInbox />, handle: { title: 'Vendor · Leads' } },
          // /vendor/projects alias for apollo probe + any UI surface that
          // labels the leads bucket as Projects (sidebar label-to-URL
          // intuition). /vendor/leads is canonical; both render LeadInbox.
          { path: 'projects', element: <LeadInbox />, handle: { title: 'Vendor · Projects' } },
          // Ship #277 — vendor-side Homeowners roster (vendor-scoped).
          { path: 'homeowners', element: <VendorHomeowners />, handle: { title: 'Vendor · Homeowners' } },
          // Ship #278 — per-homeowner detail (Sold Projects + Documents).
          { path: 'homeowners/:homeownerId', element: <VendorHomeownerDetail />, handle: { title: 'Vendor · Homeowner' } },
          { path: 'calendar', element: <VendorCalendar />, handle: { title: 'Vendor · Calendar' } },
          { path: 'catalog', element: <VendorCatalog />, handle: { title: 'Vendor · Products' } },
          // BUG-001: /vendor/products was used in older deep-links; redirect to canonical /vendor/catalog
          { path: 'products', element: <Navigate to="/vendor/catalog" replace /> },
          { path: 'banking', element: <VendorBanking />, handle: { title: 'Vendor · Banking' } },
          { path: 'financing', element: <VendorFinancingPage />, handle: { title: 'Vendor · Financing' } },
          { path: 'account-reps', element: <VendorAccountRepsPage />, handle: { title: 'Vendor · Account Reps' } },
          { path: 'employees', element: <VendorEmployeesPage />, handle: { title: 'Vendor · Employees' } },
          { path: 'membership', element: <VendorMembership />, handle: { title: 'Vendor · Membership' } },
          { path: 'messages', element: <VendorMessages />, handle: { title: 'Vendor · Messages' } },
          { path: 'profile', element: <VendorProfile />, handle: { title: 'Vendor · Profile' } },
          { path: 'settings', element: <VendorSettingsPage />, handle: { title: 'Vendor · Settings' } },
          { path: 'reports', element: <VendorReportsPage />, handle: { title: 'Vendor · Reports' } },
          { path: 'permits', element: <VendorPermitsPage />, handle: { title: 'Vendor · Permits' } },
        ],
      },

      {
        path: '/admin',
        element: (
          <RequireAuth>
            <RequireRole roles={['admin', 'admin_employee']}>
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        ),
        handle: { title: 'Admin · Overview' },
        children: [
          { index: true, element: <OverviewPage /> },
          // /admin/overview alias for apollo probe + any stale bookmarks
          // that point to the explicit overview path. /admin (index) is
          // the canonical route; /admin/overview renders the same element.
          { path: 'overview', element: <OverviewPage />, handle: { title: 'Admin · Overview' } },
          { path: 'revenue', element: <RevenuePage />, handle: { title: 'Admin · Revenue' } },
          { path: 'vendors', element: <VendorsPage />, handle: { title: 'Admin · Vendors' } },
          // Ship #284 — admin per-vendor detail (Commission + Agreement + All Projects).
          { path: 'vendors/:vendorId', element: <AdminVendorDetail />, handle: { title: 'Admin · Vendor' } },
          { path: 'employees', element: <EmployeesPage />, handle: { title: 'Admin · Employees' } },
          { path: 'messages', element: <AdminMessagesPage />, handle: { title: 'Admin · Messages' } },
          // Wave-18 #3 — Platform Support v1: homeowner ↔ admin inbox.
          { path: 'support', element: <AdminSupportPage />, handle: { title: 'Admin · Support' } },
          { path: 'transactions', element: <TransactionsPage />, handle: { title: 'Admin · Transactions' } },
          { path: 'reports', element: <ReportsPage />, handle: { title: 'Admin · Reports' } },
          { path: 'banking', element: <BankingPage />, handle: { title: 'Admin · Banking' } },
          { path: 'settings', element: <SettingsPage />, handle: { title: 'Admin · Settings' } },
          { path: 'bugs', element: <BugsPage />, handle: { title: 'Admin · Bug tracker' } },
          { path: 'tutorials', element: <AdminTutorialsPage />, handle: { title: 'Admin · Video Tutorials' } },
          { path: 'workflow', element: <WorkflowPage />, handle: { title: 'Admin · Workflow' } },
          { path: 'activity', element: <AdminActivityPage />, handle: { title: 'Admin · Activity' } },
          { path: 'products', element: <ProductsAdminPage />, handle: { title: 'Admin · Products' } },
          { path: 'users', element: <UsersPage />, handle: { title: 'Admin · Users' } },
          { path: 'homeowners', element: <HomeownersPage />, handle: { title: 'Admin · Homeowners' } },
          // Ship #280 — admin per-homeowner detail (god-view cross-vendor).
          { path: 'homeowners/:homeownerId', element: <AdminHomeownerDetail />, handle: { title: 'Admin · Homeowner' } },
          // Ship #314 — BuildConnect contract review queue (Phase 1).
          { path: 'reviews', element: <ReviewsPage />, handle: { title: 'Admin · Reviews' } },
          // Tranche-2 (mig 098) — avatar moderation queue. v1 admin only
          // (NOT admin_employee per Q1 align). Approve/Reject pending
          // avatars before they show across the platform; "Authenticated
          // users select approved avatars" RLS gates cross-user reads.
          { path: 'moderation', element: <AdminModerationPage />, handle: { title: 'Admin · Avatar Moderation' } },
          // Phase 1 Admin Financing — task_1779054206392_927. Page internally
          // checks profiles.role='admin' via RequireAuth + reads feature_flags
          // for master/category gates. Edge Fn admin-create-approval already
          // deployed; this surface drives the lenders registry + approval set.
          { path: 'financing', element: <AdminFinancingPage />, handle: { title: 'Admin · Financing' } },
          { path: 'referral-program', element: <AdminReferralProgramPage />, handle: { title: 'Admin · Referral Program' } },
          // TEMP admin manual-stepper for financing lifecycle demo (Rod-direct
          // 2026-05-18). Pre-launch hack so admin can advance/rewind any
          // application's state for walking the customer demo. Real lender
          // integration owns this transition path post-launch.
          { path: 'financing-applications/:appId', element: <AdminFinancingApplicationDetail />, handle: { title: 'Admin · Application stepper' } },
          { path: 'profile', element: <AdminProfilePage />, handle: { title: 'Admin · Profile' } },
          // Concierge "Request a Rep" — admin god-view queue. Two routes
          // back the same component: the listless URL renders the queue
          // (no detail), and :id pins the detail pane via URL-param so
          // deep-links + back/forward navigation round-trip correctly.
          { path: 'rep-requests', element: <RepRequestsPage />, handle: { title: 'Admin · Rep Requests' } },
          { path: 'rep-requests/:id', element: <RepRequestsPage />, handle: { title: 'Admin · Rep Request' } },
        ],
      },

      // Concierge "Request a Rep" — rep-scoped queue. Mounted as a
      // SEPARATE /admin/rep-requests/mine block (sibling of the main
      // /admin block) so the inner RequireRole admits {'rep','admin'}
      // without widening the parent /admin role gate. admin is in the
      // allow-list because its permission-set is a strict superset of
      // rep (PURE-SEPARATE role enum, no junction); rep is NOT in the
      // parent /admin block's allow-list so a rep hitting /admin
      // bounces to ROLE_HOME['rep'] = /admin/rep-requests/mine.
      {
        path: '/admin/rep-requests/mine',
        element: (
          <RequireAuth>
            <RequireRole roles={['rep', 'admin']}>
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        ),
        handle: { title: 'Admin · My Rep Requests' },
        children: [
          { index: true, element: <RepRequestsMinePage /> },
          { path: ':id', element: <RepRequestsMinePage />, handle: { title: 'Admin · Rep Request' } },
        ],
      },

      // Catchall — branded 404 for any unmatched path (b-002 fix).
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
