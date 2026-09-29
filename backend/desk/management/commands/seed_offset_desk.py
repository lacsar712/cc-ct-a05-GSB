from django.core.management.base import BaseCommand
from django.utils import timezone

from desk.auth_utils import hash_password
from desk.models import OffsetSubmission, User


class Command(BaseCommand):
    help = "创建默认账号与种子刀补记录"

    def handle(self, *args, **options):
        machinist, _ = User.objects.update_or_create(
            username="machinist",
            defaults={
                "role": User.Role.MACHINIST,
                "password": hash_password("machine123456"),
                "is_active": True,
            },
        )
        User.objects.update_or_create(
            username="auditor",
            defaults={
                "role": User.Role.AUDITOR,
                "password": hash_password("audit123456"),
                "is_active": True,
            },
        )

        now = timezone.now()
        seeds = [
            ("T01", 5, OffsetSubmission.Verdict.PASS, 36),
            ("T09", 20, OffsetSubmission.Verdict.FAIL, 38),
        ]
        for tool_code, offset_um, verdict, spindle_temp_c in seeds:
            OffsetSubmission.objects.update_or_create(
                tool_code=tool_code,
                offset_um=offset_um,
                defaults={
                    "status": OffsetSubmission.Status.DONE,
                    "verdict": verdict,
                    "spindle_temp_c": spindle_temp_c,
                    "submitted_by": machinist,
                    "reviewed_at": now,
                },
            )

        self.stdout.write(self.style.SUCCESS("seed_offset_desk 完成"))
