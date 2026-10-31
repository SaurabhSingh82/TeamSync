from django.db import migrations, models
import django.db.models.deletion


POSTGRESQL_FUNCTIONS = (
    """
    CREATE FUNCTION teamsync_lock_workspace_owner(p_workspace_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    BEGIN
        PERFORM id
        FROM workspaces_workspace
        WHERE id = p_workspace_id
        FOR UPDATE;
    END;
    $$
    """,
    """
    CREATE FUNCTION teamsync_lock_owner_membership_changes()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        IF TG_OP = 'INSERT' THEN
            IF NEW.role = 'owner' THEN
                PERFORM teamsync_lock_workspace_owner(NEW.workspace_id);
            END IF;
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            IF OLD.role = 'owner' THEN
                PERFORM teamsync_lock_workspace_owner(OLD.workspace_id);
            END IF;
            RETURN OLD;
        END IF;

        IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
            PERFORM teamsync_lock_workspace_owner(OLD.workspace_id);
            IF NEW.workspace_id <> OLD.workspace_id THEN
                PERFORM teamsync_lock_workspace_owner(NEW.workspace_id);
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$
    """,
    """
    CREATE FUNCTION teamsync_check_workspace_owner(p_workspace_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
        workspace_owner_id uuid;
        membership_owner_id uuid;
        owner_count bigint;
    BEGIN
        SELECT owner_id
        INTO workspace_owner_id
        FROM workspaces_workspace
        WHERE id = p_workspace_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        SELECT COUNT(*), (ARRAY_AGG(user_id))[1]
        INTO owner_count, membership_owner_id
        FROM workspaces_workspacemember
        WHERE workspace_id = p_workspace_id
          AND role = 'owner';

        IF owner_count <> 1
           OR membership_owner_id IS DISTINCT FROM workspace_owner_id THEN
            RAISE EXCEPTION
                USING ERRCODE = '23514',
                      CONSTRAINT = 'workspace_owner_membership_consistent',
                      MESSAGE = 'Workspace must have exactly one matching Owner membership.';
        END IF;
    END;
    $$
    """,
    """
    CREATE FUNCTION teamsync_validate_workspace_owner_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        IF TG_TABLE_NAME = 'workspaces_workspace' THEN
            IF TG_OP = 'DELETE' THEN
                PERFORM teamsync_check_workspace_owner(OLD.id);
            ELSE
                PERFORM teamsync_check_workspace_owner(NEW.id);
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            PERFORM teamsync_check_workspace_owner(OLD.workspace_id);
        ELSIF TG_OP = 'UPDATE' THEN
            PERFORM teamsync_check_workspace_owner(OLD.workspace_id);
            IF NEW.workspace_id <> OLD.workspace_id THEN
                PERFORM teamsync_check_workspace_owner(NEW.workspace_id);
            END IF;
        ELSE
            PERFORM teamsync_check_workspace_owner(NEW.workspace_id);
        END IF;
        RETURN NULL;
    END;
    $$
    """,
)

POSTGRESQL_TRIGGERS = (
    """
    CREATE TRIGGER workspaces_owner_membership_lock
    BEFORE INSERT OR UPDATE OR DELETE ON workspaces_workspacemember
    FOR EACH ROW
    EXECUTE FUNCTION teamsync_lock_owner_membership_changes()
    """,
    """
    CREATE CONSTRAINT TRIGGER workspaces_owner_consistent_workspace
    AFTER INSERT OR UPDATE OR DELETE ON workspaces_workspace
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION teamsync_validate_workspace_owner_change()
    """,
    """
    CREATE CONSTRAINT TRIGGER workspaces_owner_consistent_membership
    AFTER INSERT OR UPDATE OR DELETE ON workspaces_workspacemember
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION teamsync_validate_workspace_owner_change()
    """,
)

POSTGRESQL_DROP = (
    "DROP TRIGGER IF EXISTS workspaces_owner_consistent_membership ON workspaces_workspacemember",
    "DROP TRIGGER IF EXISTS workspaces_owner_consistent_workspace ON workspaces_workspace",
    "DROP TRIGGER IF EXISTS workspaces_owner_membership_lock ON workspaces_workspacemember",
    "DROP FUNCTION IF EXISTS teamsync_validate_workspace_owner_change()",
    "DROP FUNCTION IF EXISTS teamsync_check_workspace_owner(uuid)",
    "DROP FUNCTION IF EXISTS teamsync_lock_owner_membership_changes()",
    "DROP FUNCTION IF EXISTS teamsync_lock_workspace_owner(uuid)",
)


def install_postgresql_owner_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM workspaces_workspace AS workspace
                    LEFT JOIN workspaces_workspacemember AS membership
                      ON membership.workspace_id = workspace.id
                     AND membership.role = 'owner'
                    GROUP BY workspace.id, workspace.owner_id
                    HAVING COUNT(membership.id) <> 1
                        OR COUNT(membership.id) FILTER (
                            WHERE membership.user_id = workspace.owner_id
                        ) <> 1
                ) THEN
                    RAISE EXCEPTION
                        'Existing workspaces violate the Owner membership invariant.';
                END IF;
            END;
            $$;
            """
        )
        for statement in POSTGRESQL_FUNCTIONS + POSTGRESQL_TRIGGERS:
            cursor.execute(statement)


def uninstall_postgresql_owner_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for statement in POSTGRESQL_DROP:
            cursor.execute(statement)


class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceInvitationEmail",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("sent", "Sent"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=10,
                    ),
                ),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("last_error", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                (
                    "invitation",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="email_delivery",
                        to="workspaces.workspaceinvitation",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="workspaceinvitationemail",
            index=models.Index(
                fields=["status", "created_at"],
                name="invite_email_status_idx",
            ),
        ),
        migrations.RunPython(
            install_postgresql_owner_triggers,
            uninstall_postgresql_owner_triggers,
        ),
    ]
