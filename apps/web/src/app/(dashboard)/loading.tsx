import { PageLoader } from '@/components/LoadingSpinner'

export default function DashboardLoading() {
  return (
    <div className="p-8">
      <PageLoader message="Loading..." />
    </div>
  )
}
