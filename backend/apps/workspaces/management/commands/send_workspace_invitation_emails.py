from django.core.management.base import BaseCommand, CommandError

from apps.workspaces.services import dispatch_pending_invitation_emails


class Command(BaseCommand):
    help = "Send pending workspace invitation emails from the transactional outbox."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = options["limit"]
        if limit < 1:
            raise CommandError("--limit must be a positive integer.")

        result = dispatch_pending_invitation_emails(limit=limit)
        self.stdout.write(
            self.style.SUCCESS(
                "Invitation email outbox: "
                f"{result['sent']} sent, {result['failed']} failed, "
                f"{result['skipped']} skipped."
            )
        )
