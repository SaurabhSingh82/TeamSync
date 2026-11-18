from importlib import import_module

from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tasks"

    def ready(self):
        import_module("apps.tasks.signals")
