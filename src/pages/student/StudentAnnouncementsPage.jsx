import { useEffect } from 'react'
import { useAnnouncements, useNotifications } from '@/hooks/useData'
import { PageHeader, LoadingPage, EmptyState } from '@/components/ui'
import AnnouncementInbox from '@/components/shared/AnnouncementInbox'

export default function StudentAnnouncementsPage() {
  const { announcements, loading, setupNeeded } = useAnnouncements()
  const { markReadByType } = useNotifications()

  // Opening this page is reading them, so clear the badge here too, not only
  // when the bell item is clicked
  useEffect(() => { markReadByType(['announcement']) }, [markReadByType])

  if (loading) return <LoadingPage variant="inbox" />

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Notices from your faculty, for all students and for the classrooms you are in"
      />

      {setupNeeded ? (
        <EmptyState
          icon="campaign"
          title="Announcements are not available yet"
          description="Ask an administrator to apply the announcements migration."
        />
      ) : (
        <AnnouncementInbox
          announcements={announcements}
          showAuthor
          emptyState={
            <div className="flex flex-col items-center text-center px-6 py-16 sm:py-20">
              <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>campaign</span>
              </div>
              <div className="text-base font-bold text-text">No announcements yet</div>
              <p className="text-sm text-text-faint mt-1 max-w-xs">
                When a faculty member posts an announcement for you, it appears here.
              </p>
            </div>
          }
        />
      )}
    </div>
  )
}
