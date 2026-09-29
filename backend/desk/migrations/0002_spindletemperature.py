from django.db import migrations, models
import django.db.models.deletion


def backfill_temperatures(apps, schema_editor):
    """旧单补历史温度快照值（36℃），不产生温感台记录——温感台仍为空，首笔送检照样缺温挡回。"""
    OffsetSubmission = apps.get_model("desk", "OffsetSubmission")
    OffsetSubmission.objects.filter(spindle_temp_c=0).update(spindle_temp_c=36)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("desk", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SpindleTemperature",
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
                ("temp_c", models.IntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="temperature_records",
                        to="desk.user",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddField(
            model_name="offsetsubmission",
            name="spindle_temp_c",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="offsetsubmission",
            name="spindle_temp",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="submissions",
                to="desk.spindletemperature",
            ),
        ),
        migrations.RunPython(backfill_temperatures, noop),
        migrations.AlterField(
            model_name="offsetsubmission",
            name="spindle_temp_c",
            field=models.IntegerField(),
        ),
    ]
