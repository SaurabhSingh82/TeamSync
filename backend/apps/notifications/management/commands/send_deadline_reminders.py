from django.core.management.base import BaseCommand

from apps.notifications.services import dispatch_deadline_reminders


class Command(BaseCommand):
    help = "Create idempotent in-app notifications for due and overdue tasks."

    def handle(self, *args, **options):
        created = dispatch_deadline_reminders()
        self.stdout.write(
            self.style.SUCCESS(f"Created {created} deadline reminder(s).")
        )
