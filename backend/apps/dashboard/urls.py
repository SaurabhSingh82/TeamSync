from django.urls import path

from apps.dashboard.views import AnalyticsView, CalendarEventsView, DashboardSummaryView


urlpatterns = [
    path("dashboard/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("calendar/events/", CalendarEventsView.as_view(), name="calendar-events"),
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
]
