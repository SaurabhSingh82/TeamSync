from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0005_remove_workspaceinvitation_valid_workspace_invite_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspaceinvitation",
            name="message",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
