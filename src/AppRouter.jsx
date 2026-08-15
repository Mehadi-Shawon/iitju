import { Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth, RedirectIfAuthed } from '@/components/shared/RouteGuard'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import StaffProfilePage from '@/pages/staff/StaffProfilePage'
import StatusUpdatePage from '@/pages/staff/StatusUpdatePage'
import QRCheckInPage from '@/pages/staff/QRCheckInPage'
import AdminUsersPage from '@/pages/admin/AdminUsersPage'
import AdminActivityPage from '@/pages/admin/AdminActivityPage'
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage'
import AdminQRScanPage from '@/pages/admin/AdminQRScanPage'
import ScheduleRequestPage from '@/pages/student/ScheduleRequestPage'
import FacultySchedulePage from '@/pages/staff/FacultySchedulePage'
import ThesisSubmitPage from '@/pages/student/ThesisSubmitPage'
import ThesisReviewPage from '@/pages/staff/ThesisReviewPage'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={
        <RedirectIfAuthed>
          <LoginPage />
        </RedirectIfAuthed>
      } />

      {/* All app pages as flat routes inside AppLayout */}
      <Route path="/app/dashboard" element={
        <RequireAuth>
          <AppLayout><DashboardPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/staff/profile" element={
        <RequireAuth roles={['staff', 'admin']}>
          <AppLayout><StaffProfilePage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/staff/status" element={
        <RequireAuth roles={['staff', 'admin']}>
          <AppLayout><StatusUpdatePage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/staff/checkin" element={
        <RequireAuth roles={['staff', 'admin']}>
          <AppLayout><QRCheckInPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/admin/users" element={
        <RequireAuth roles={['admin']}>
          <AppLayout><AdminUsersPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/admin/qrscan" element={
        <RequireAuth roles={['admin']}>
          <AppLayout><AdminQRScanPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/admin/activity" element={
        <RequireAuth roles={['admin']}>
          <AppLayout><AdminActivityPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/admin/settings" element={
        <RequireAuth roles={['admin']}>
          <AppLayout><AdminSettingsPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/student/schedule" element={
        <RequireAuth roles={['student']}>
          <AppLayout><ScheduleRequestPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/staff/schedule" element={
        <RequireAuth roles={['staff', 'admin']}>
          <AppLayout><FacultySchedulePage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/student/submissions" element={
        <RequireAuth roles={['student']}>
          <AppLayout><ThesisSubmitPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="/app/staff/submissions" element={
        <RequireAuth roles={['staff', 'admin']}>
          <AppLayout><ThesisReviewPage /></AppLayout>
        </RequireAuth>
      } />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}