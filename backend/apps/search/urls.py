from django.urls import path

from apps.search.views import GlobalSearchView


urlpatterns = [
    path("search/", GlobalSearchView.as_view(), name="global-search"),
]
