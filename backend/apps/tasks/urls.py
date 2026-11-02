from django.urls import path

from apps.tasks.views import (
    ProjectLabelListCreateView,
    TaskActionView,
    TaskAssignmentView,
    TaskCommentDetailView,
    TaskCommentListCreateView,
    TaskDetailView,
    TaskLabelView,
    TaskListCreateView,
    TaskSubtaskDetailView,
    TaskSubtaskListCreateView,
)


urlpatterns = [
    path("tasks/", TaskListCreateView.as_view(), name="task-list-create"),
    path("tasks/<uuid:task_id>/", TaskDetailView.as_view(), name="task-detail"),
    path(
        "tasks/<uuid:task_id>/assignees/",
        TaskAssignmentView.as_view(collaborator=False),
        name="task-assignees",
    ),
    path(
        "tasks/<uuid:task_id>/assignees/<uuid:user_id>/",
        TaskAssignmentView.as_view(collaborator=False),
        name="task-assignee-detail",
    ),
    path(
        "tasks/<uuid:task_id>/collaborators/",
        TaskAssignmentView.as_view(collaborator=True),
        name="task-collaborators",
    ),
    path(
        "tasks/<uuid:task_id>/collaborators/<uuid:user_id>/",
        TaskAssignmentView.as_view(collaborator=True),
        name="task-collaborator-detail",
    ),
    path(
        "tasks/<uuid:task_id>/labels/",
        TaskLabelView.as_view(),
        name="task-labels",
    ),
    path(
        "tasks/<uuid:task_id>/labels/<uuid:label_id>/",
        TaskLabelView.as_view(),
        name="task-label-detail",
    ),
    path(
        "tasks/<uuid:task_id>/subtasks/",
        TaskSubtaskListCreateView.as_view(),
        name="task-subtasks",
    ),
    path(
        "tasks/<uuid:task_id>/subtasks/<uuid:subtask_id>/",
        TaskSubtaskDetailView.as_view(),
        name="task-subtask-detail",
    ),
    path(
        "tasks/<uuid:task_id>/comments/",
        TaskCommentListCreateView.as_view(),
        name="task-comments",
    ),
    path(
        "tasks/<uuid:task_id>/comments/<uuid:comment_id>/",
        TaskCommentDetailView.as_view(),
        name="task-comment-detail",
    ),
    path(
        "projects/<uuid:project_id>/labels/",
        ProjectLabelListCreateView.as_view(),
        name="project-task-labels",
    ),
    path(
        "tasks/<uuid:task_id>/<str:action>/",
        TaskActionView.as_view(),
        name="task-action",
    ),
]
