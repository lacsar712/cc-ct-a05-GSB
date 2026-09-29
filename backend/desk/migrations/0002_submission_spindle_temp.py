from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("desk", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="offsetsubmission",
            name="spindle_temp_c",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
