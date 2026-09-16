from pydantic import BaseModel, ConfigDict

from app.models.enums import Weekday


class AppSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    planning_week_start_day: Weekday


class AppSettingsUpdate(BaseModel):
    planning_week_start_day: Weekday
