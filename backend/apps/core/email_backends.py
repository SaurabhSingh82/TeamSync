import os

from django.core.mail.backends.console import EmailBackend as ConsoleEmailBackend


def open_interactive_console():
    if os.name == "nt":
        return open("CONOUT$", "w", encoding="utf-8", errors="replace")
    return open("/dev/tty", "w", encoding="utf-8", errors="replace")


class InteractiveConsoleEmailBackend(ConsoleEmailBackend):
    def __init__(self, *args, **kwargs):
        self._provided_stream = kwargs.pop("stream", None)
        super().__init__(*args, stream=self._provided_stream, **kwargs)

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        if self._provided_stream is not None:
            return super().send_messages(email_messages)

        try:
            stream = open_interactive_console()
        except OSError:
            if self.fail_silently:
                return 0
            raise OSError(
                "The interactive email console is unavailable; configure an SMTP backend."
            ) from None

        original_stream = self.stream
        self.stream = stream
        try:
            return super().send_messages(email_messages)
        finally:
            stream.close()
            self.stream = original_stream
