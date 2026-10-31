import re
import tempfile
from io import BytesIO
from urllib.parse import parse_qs, urlparse

from django.core.cache import cache
from django.core import mail
from django.test import Client, TestCase, override_settings
from django.test.client import MULTIPART_CONTENT, encode_multipart
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.users.models import User


PASSWORD = "M0onlight!River!92"


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.media_directory = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_directory.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media_directory.cleanup)
        self.client = Client(enforce_csrf_checks=True)
        response = self.client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, 200, response.content)
        self.csrf_token = response.json()["csrfToken"]

    def post_json(self, path, data):
        return self.client.post(
            path,
            data,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def create_user(self, **overrides):
        return User.objects.create_user(
            username=overrides.get("username", "river-user"),
            email=overrides.get("email", "river@example.com"),
            password=overrides.get("password", PASSWORD),
        )

    def register(self, username="river-user", email="river@example.com"):
        return self.post_json(
            "/api/auth/register/",
            {
                "username": username,
                "email": email,
                "password": PASSWORD,
                "first_name": "River",
            },
        )

    def login(self, identifier="river-user", password=PASSWORD):
        return self.post_json(
            "/api/auth/login/",
            {"identifier": identifier, "password": password},
        )

    def test_registration_hashes_password_and_sends_verification_email(self):
        response = self.register()

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="river@example.com")
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.email_verified)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email?token=", mail.outbox[0].body)

    def test_registration_requires_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)

        response = client.post(
            "/api/auth/register/",
            {
                "username": "no-csrf",
                "email": "no-csrf@example.com",
                "password": PASSWORD,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="no-csrf").exists())

    def test_registration_rejects_case_insensitive_duplicate_email(self):
        self.create_user()

        response = self.register(username="another-user", email="RIVER@example.com")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_registration_throttle_allows_ten_attempts_per_hour(self):
        cache.clear()
        for attempt in range(10):
            with self.subTest(attempt=attempt):
                response = self.register(
                    username=f"rate-user-{attempt}",
                    email=f"rate-user-{attempt}@example.com",
                )
                self.assertEqual(response.status_code, 201, response.content)

        blocked = self.register(
            username="rate-user-over-limit",
            email="rate-user-over-limit@example.com",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("available in", blocked.json()["detail"])

    def test_login_accepts_email_sets_httponly_cookies_and_current_user(self):
        user = self.create_user()

        response = self.login(identifier="RIVER@example.com")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["id"], str(user.pk))
        access_cookie = response.cookies["teamsync_access"]
        refresh_cookie = response.cookies["teamsync_refresh"]
        self.assertTrue(access_cookie["httponly"])
        self.assertTrue(refresh_cookie["httponly"])
        self.assertEqual(access_cookie["path"], "/api/")
        self.assertEqual(refresh_cookie["path"], "/api/auth/")

        profile = self.client.get("/api/auth/me/")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["email"], user.email)

    def test_login_rejects_incorrect_password(self):
        self.create_user()

        response = self.login(password="incorrect-password")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid username/email or password.")

    def test_profile_update_requires_csrf_and_resets_email_verification(self):
        user = self.create_user()
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        self.login()

        response = self.client.patch(
            "/api/auth/me/",
            {"email": "new@example.com", "bio": "Hello TeamSync"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.email, "new@example.com")
        self.assertFalse(user.email_verified)
        self.assertEqual(user.bio, "Hello TeamSync")
        self.assertIn("verify-email", mail.outbox[-1].body)

    def test_authenticated_profile_mutation_rejects_missing_csrf_token(self):
        self.create_user()
        self.login()

        response = self.client.patch(
            "/api/auth/me/",
            {"bio": "This request has no CSRF header"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.get(username="river-user").bio, "")

    def test_refresh_rotates_refresh_token_and_blacklists_previous_token(self):
        self.create_user()
        login_response = self.login()
        old_refresh = login_response.cookies["teamsync_refresh"].value

        response = self.post_json("/api/auth/refresh/", {})

        self.assertEqual(response.status_code, 204)
        new_refresh = response.cookies["teamsync_refresh"].value
        self.assertNotEqual(old_refresh, new_refresh)

        self.client.cookies["teamsync_refresh"] = old_refresh
        self.client.cookies["teamsync_refresh"]["path"] = "/api/auth/"
        replay = self.post_json("/api/auth/refresh/", {})
        self.assertEqual(replay.status_code, 401)

    def test_logout_clears_cookies_and_blacklists_refresh_token(self):
        self.create_user()
        login_response = self.login()
        refresh = login_response.cookies["teamsync_refresh"].value

        response = self.post_json("/api/auth/logout/", {})

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies["teamsync_access"]["max-age"], 0)
        self.assertEqual(response.cookies["teamsync_refresh"]["max-age"], 0)
        self.assertEqual(self.client.cookies["teamsync_refresh"].value, "")
        self.client.cookies["teamsync_refresh"] = refresh
        self.client.cookies["teamsync_refresh"]["path"] = "/api/auth/"
        replay = self.post_json("/api/auth/refresh/", {})
        self.assertEqual(replay.status_code, 401)

    def test_password_reset_is_enumeration_safe_and_changes_password(self):
        user = self.create_user()
        login_response = self.login()
        old_refresh = login_response.cookies["teamsync_refresh"].value
        response = self.post_json(
            "/api/auth/password-reset/",
            {"email": "missing@example.com"},
        )
        self.assertEqual(response.status_code, 202)
        generic_response = response.json()

        response = self.post_json(
            "/api/auth/password-reset/",
            {"email": user.email},
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json(), generic_response)
        self.assertEqual(len(mail.outbox), 1)

        link = re.search(r"https?://\S+", mail.outbox[0].body).group(0)
        query = parse_qs(urlparse(link).query)
        new_password = "Different!Password!473"
        response = self.post_json(
            "/api/auth/password-reset/confirm/",
            {
                "uid": query["uid"][0],
                "token": query["token"][0],
                "password": new_password,
            },
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password(new_password))
        self.client.cookies["teamsync_refresh"] = old_refresh
        self.client.cookies["teamsync_refresh"]["path"] = "/api/auth/"
        self.assertEqual(self.post_json("/api/auth/refresh/", {}).status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password=new_password).status_code, 200)

    def test_email_verification_accepts_signed_link_and_is_idempotent(self):
        registration = self.register(username="verified-user", email="verified@example.com")
        self.assertEqual(registration.status_code, 201)
        link = re.search(r"https?://\S+", mail.outbox[-1].body).group(0)
        token = parse_qs(urlparse(link).query)["token"][0]

        first = self.post_json("/api/auth/email/verify/", {"token": token})
        second = self.post_json("/api/auth/email/verify/", {"token": token})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(User.objects.get(email="verified@example.com").email_verified)

    def test_avatar_upload_accepts_png_and_rejects_svg(self):
        user = self.create_user()
        self.login()
        image_buffer = BytesIO()
        Image.new("RGB", (32, 32), color="blue").save(image_buffer, format="PNG")

        response = self.client.patch(
            "/api/auth/me/",
            encode_multipart(
                "BoUnDaRyStRiNg",
                {
                    "avatar": SimpleUploadedFile(
                        "avatar.png",
                        image_buffer.getvalue(),
                        content_type="image/png",
                    )
                },
            ),
            content_type=MULTIPART_CONTENT,
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        updated_user = User.objects.get(pk=user.pk)
        self.assertTrue(updated_user.avatar.name.endswith(".png"), response.content)
        self.assertTrue(
            updated_user.avatar.storage.exists(updated_user.avatar.name),
            response.content,
        )
        self.assertTrue(response.json()["avatar"].endswith(".png"), response.content)

        response = self.client.patch(
            "/api/auth/me/",
            encode_multipart(
                "BoUnDaRyStRiNg",
                {
                    "avatar": SimpleUploadedFile(
                        "avatar.svg",
                        b"<svg></svg>",
                        content_type="image/svg+xml",
                    )
                },
            ),
            content_type=MULTIPART_CONTENT,
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(response.status_code, 400)
        oversized = self.client.patch(
            "/api/auth/me/",
            encode_multipart(
                "BoUnDaRyStRiNg",
                {
                    "avatar": SimpleUploadedFile(
                        "large.png",
                        b"x" * (5 * 1024 * 1024 + 1),
                        content_type="image/png",
                    )
                },
            ),
            content_type=MULTIPART_CONTENT,
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(oversized.status_code, 400)
        self.assertIn(b"5 MB or smaller", oversized.content)
        user.refresh_from_db()
        user.avatar.delete(save=False)
