"""Development seed data — NOT for production use.

Run with: python seed.py  (inside the backend venv, DATABASE_URL configured)

Creates the users, projects, apartments and rooms described in spec §46 so
the UI (dashboard, projects list, project detail, room detail) has realistic
data to render against. Safe to re-run: it clears and recreates the tables
it owns.
"""
from datetime import date, timedelta

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.apartment import Apartment
from app.models.comment import Comment
from app.models.enums import (
    ApartmentStatus,
    CommentStatus,
    CommentType,
    Priority,
    ProjectStatus,
    RoomWorkflowStatus,
    StageTransitionOutcome,
    UserRole,
)
from app.models.project import Project
from app.models.project_assignment import ProjectAssignment
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.user import User
from app.models.workflow_stage import DEFAULT_WORKFLOW_STAGES, WorkflowStage

TODAY = date.today()


def stage_by_key(db, key: str) -> WorkflowStage:
    return db.query(WorkflowStage).filter(WorkflowStage.key == key).one()


def run() -> None:
    Base.metadata.create_all(bind=engine)  # no-op if Alembic already created tables
    db = SessionLocal()
    try:
        print("Clearing existing seed-owned data...")
        db.query(Comment).delete()
        db.query(RoomStageEvent).delete()
        db.query(Room).delete()
        db.query(ProjectAssignment).delete()
        db.query(Apartment).delete()
        db.query(Project).delete()
        db.query(User).delete()
        db.query(WorkflowStage).delete()
        db.commit()

        print("Seeding workflow stages...")
        for s in DEFAULT_WORKFLOW_STAGES:
            db.add(WorkflowStage(**s))
        db.commit()

        print("Seeding users...")
        admin = User(
            email="admin@detailflow.dev",
            full_name="Alex Admin",
            role=UserRole.ADMIN,
            hashed_password=hash_password("password123"),
        )
        manager = User(
            email="manager@detailflow.dev",
            full_name="Morgan Blake",
            role=UserRole.MANAGER,
            hashed_password=hash_password("password123"),
        )
        team_leader = User(
            email="teamleader@detailflow.dev",
            full_name="Taylor Reid",
            role=UserRole.TEAM_LEADER,
            hashed_password=hash_password("password123"),
        )
        sarah = User(
            email="sarah@detailflow.dev",
            full_name="Sarah Nguyen",
            role=UserRole.DETAILER,
            hashed_password=hash_password("password123"),
        )
        john = User(
            email="john@detailflow.dev",
            full_name="John Petrov",
            role=UserRole.DETAILER,
            hashed_password=hash_password("password123"),
        )
        mike = User(
            email="mike@detailflow.dev",
            full_name="Mike Costa",
            role=UserRole.DETAILER,
            hashed_password=hash_password("password123"),
        )
        db.add_all([admin, manager, team_leader, sarah, john, mike])
        db.commit()

        setup = stage_by_key(db, "setup")
        modelling = stage_by_key(db, "modelling_3d")
        check_measure = stage_by_key(db, "waiting_check_measure")
        final_detailing = stage_by_key(db, "final_detailing")
        initial_review = stage_by_key(db, "initial_review")
        issued_for_approval = stage_by_key(db, "issued_for_approval")
        internal_review = stage_by_key(db, "internal_review")
        drawings_submitted = stage_by_key(db, "drawings_submitted")
        revision = stage_by_key(db, "revision")
        issued_for_construction = stage_by_key(db, "issued_for_construction")
        complete = stage_by_key(db, "complete")

        # ---- Richmond Apartments ----
        print("Seeding Richmond Apartments...")
        richmond = Project(
            project_number="P-1001",
            name="Richmond Apartments",
            client_name="Richmond Developments Pty Ltd",
            builder="Hargrove Construction",
            site_address="45 Bridge Rd, Richmond VIC",
            project_manager="Dana Whitfield",
            description="42-apartment residential development — kitchens, laundries, ensuites and wardrobes across 3 sample apartments for this seed.",
            priority=Priority.HIGH,
            status=ProjectStatus.IN_PROGRESS,
            team_leader_id=team_leader.id,
            start_date=TODAY - timedelta(days=20),
            detailing_due_date=TODAY + timedelta(days=10),
            installation_date=TODAY + timedelta(days=45),
            estimated_hours=180,
        )
        db.add(richmond)
        db.flush()

        for user in (sarah, john):
            db.add(ProjectAssignment(project_id=richmond.id, user_id=user.id))

        apt_101 = Apartment(
            project_id=richmond.id,
            name="Apartment 101",
            level="Level 1",
            apartment_type="Type A",
            assigned_detailer_id=sarah.id,
            due_date=TODAY + timedelta(days=5),
            status=ApartmentStatus.IN_PROGRESS,
        )
        apt_102 = Apartment(
            project_id=richmond.id,
            name="Apartment 102",
            level="Level 1",
            apartment_type="Type A",
            assigned_detailer_id=sarah.id,
            due_date=TODAY + timedelta(days=7),
            status=ApartmentStatus.IN_PROGRESS,
        )
        apt_103 = Apartment(
            project_id=richmond.id,
            name="Apartment 103",
            level="Level 2",
            apartment_type="Type B",
            assigned_detailer_id=john.id,
            due_date=TODAY + timedelta(days=9),
            status=ApartmentStatus.NOT_STARTED,
        )
        db.add_all([apt_101, apt_102, apt_103])
        db.flush()

        richmond_rooms = [
            # Apartment 101 — fully modelled, one room mid-review
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Kitchen",
                 assigned_detailer_id=sarah.id, workflow_stage_id=internal_review.id,
                 workflow_status=RoomWorkflowStatus.READY_FOR_REVIEW,
                 priority=Priority.HIGH, due_date=TODAY + timedelta(days=5), estimated_hours=14),
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Laundry",
                 assigned_detailer_id=sarah.id, workflow_stage_id=complete.id,
                 workflow_status=RoomWorkflowStatus.COMPLETE,
                 due_date=TODAY - timedelta(days=2), estimated_hours=4),
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Ensuite",
                 assigned_detailer_id=sarah.id, workflow_stage_id=final_detailing.id,
                 workflow_status=RoomWorkflowStatus.IN_PROGRESS,
                 due_date=TODAY + timedelta(days=4), estimated_hours=6),
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Wardrobe",
                 assigned_detailer_id=sarah.id, workflow_stage_id=modelling.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=6), estimated_hours=3),
            # Apartment 102 — kitchen came back with markups, now in revision
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Kitchen",
                 assigned_detailer_id=sarah.id, workflow_stage_id=revision.id,
                 workflow_status=RoomWorkflowStatus.CHANGES_REQUIRED,
                 priority=Priority.HIGH, due_date=TODAY + timedelta(days=3), estimated_hours=14),
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Laundry",
                 assigned_detailer_id=sarah.id, workflow_stage_id=issued_for_construction.id,
                 workflow_status=RoomWorkflowStatus.COMPLETE,
                 due_date=TODAY + timedelta(days=1), estimated_hours=4),
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Ensuite",
                 assigned_detailer_id=sarah.id, workflow_stage_id=modelling.id,
                 workflow_status=RoomWorkflowStatus.IN_PROGRESS,
                 due_date=TODAY + timedelta(days=7), estimated_hours=6),
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Wardrobe",
                 assigned_detailer_id=sarah.id, workflow_stage_id=setup.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=8), estimated_hours=3),
            # Apartment 103 — waiting on check measure, blocked feel
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Kitchen",
                 assigned_detailer_id=john.id, workflow_stage_id=check_measure.id,
                 workflow_status=RoomWorkflowStatus.WAITING,
                 priority=Priority.URGENT, due_date=TODAY + timedelta(days=2), estimated_hours=14),
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Laundry",
                 assigned_detailer_id=john.id, workflow_stage_id=check_measure.id,
                 workflow_status=RoomWorkflowStatus.WAITING,
                 due_date=TODAY + timedelta(days=2), estimated_hours=4),
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Ensuite",
                 assigned_detailer_id=john.id, workflow_stage_id=setup.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=9), estimated_hours=6),
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Wardrobe",
                 assigned_detailer_id=john.id, workflow_stage_id=setup.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=9), estimated_hours=3),
        ]
        db.add_all(richmond_rooms)
        db.flush()

        apt101_kitchen = richmond_rooms[0]
        apt102_kitchen = richmond_rooms[4]
        apt103_kitchen = richmond_rooms[7]

        # ---- Smith Residence ----
        print("Seeding Smith Residence...")
        smith = Project(
            project_number="P-1002",
            name="Smith Residence",
            client_name="John & Kate Smith",
            builder="Coastal Homes",
            site_address="12 Seaview Ct, Mornington VIC",
            project_manager="Dana Whitfield",
            description="Custom residential joinery — kitchen, butler's pantry, laundry and walk-in robe.",
            priority=Priority.NORMAL,
            status=ProjectStatus.WAITING_FOR_CHECK_MEASURE,
            team_leader_id=team_leader.id,
            start_date=TODAY - timedelta(days=8),
            detailing_due_date=TODAY + timedelta(days=15),
            installation_date=TODAY + timedelta(days=50),
            estimated_hours=60,
        )
        db.add(smith)
        db.flush()
        db.add(ProjectAssignment(project_id=smith.id, user_id=mike.id))

        smith_rooms = [
            Room(project_id=smith.id, name="Kitchen", assigned_detailer_id=mike.id,
                 workflow_stage_id=modelling.id, workflow_status=RoomWorkflowStatus.IN_PROGRESS,
                 priority=Priority.HIGH, due_date=TODAY + timedelta(days=6), estimated_hours=16),
            Room(project_id=smith.id, name="Butler's Pantry", assigned_detailer_id=mike.id,
                 workflow_stage_id=check_measure.id, workflow_status=RoomWorkflowStatus.WAITING,
                 due_date=TODAY + timedelta(days=10), estimated_hours=8),
            Room(project_id=smith.id, name="Laundry", assigned_detailer_id=mike.id,
                 workflow_stage_id=internal_review.id, workflow_status=RoomWorkflowStatus.READY_FOR_REVIEW,
                 due_date=TODAY + timedelta(days=4), estimated_hours=4),
            Room(project_id=smith.id, name="Walk-in Robe", assigned_detailer_id=mike.id,
                 workflow_stage_id=setup.id, workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=14), estimated_hours=5),
        ]
        db.add_all(smith_rooms)
        db.flush()
        smith_laundry = smith_rooms[2]

        db.commit()

        # progress cache — same formula as services/room_service.refresh_room_progress
        total_stages = db.query(WorkflowStage).count()
        for room in db.query(Room).all():
            room.progress = round((room.workflow_stage.sequence / total_stages) * 100)
        db.commit()

        # ---- Stage history: give a couple of rooms a real review trail ----
        print("Seeding stage history and comments...")

        def add_event(room, from_stage, to_stage, actor, days_ago, outcome=None, note=None):
            db.add(
                RoomStageEvent(
                    room_id=room.id,
                    from_stage_id=from_stage.id if from_stage else None,
                    to_stage_id=to_stage.id,
                    outcome=outcome,
                    note=note,
                    changed_by_id=actor.id,
                    created_at=TODAY - timedelta(days=days_ago),
                )
            )

        # Apartment 101 Kitchen: clean run so far, currently in Internal Review
        add_event(apt101_kitchen, setup, modelling, sarah, 18)
        add_event(apt101_kitchen, modelling, check_measure, sarah, 15)
        add_event(apt101_kitchen, check_measure, final_detailing, sarah, 12)
        add_event(apt101_kitchen, final_detailing, initial_review, sarah, 6)
        add_event(apt101_kitchen, initial_review, issued_for_approval, sarah, 5)
        add_event(apt101_kitchen, issued_for_approval, internal_review, team_leader, 3)

        # Apartment 102 Kitchen: went all the way out and came back with markups
        add_event(apt102_kitchen, setup, modelling, sarah, 25)
        add_event(apt102_kitchen, modelling, check_measure, sarah, 22)
        add_event(apt102_kitchen, check_measure, final_detailing, sarah, 18)
        add_event(apt102_kitchen, final_detailing, initial_review, sarah, 10)
        add_event(apt102_kitchen, initial_review, issued_for_approval, sarah, 9)
        add_event(apt102_kitchen, issued_for_approval, internal_review, team_leader, 8)
        add_event(
            apt102_kitchen, internal_review, drawings_submitted, team_leader, 7,
            outcome=StageTransitionOutcome.APPROVED,
            note="Internally reviewed, no issues — issuing to the client for approval.",
        )
        add_event(
            apt102_kitchen, drawings_submitted, revision, manager, 2,
            outcome=StageTransitionOutcome.MARKUPS_REQUIRED,
            note="Client marked up the fridge panel projection and sink cabinet width — see RFI.",
        )

        db.commit()

        def add_comment(project, room, ctype, body, author, days_ago, title=None, resolved_by=None, resolved_days_ago=None):
            comment = Comment(
                project_id=project.id,
                room_id=room.id if room else None,
                workflow_stage_id=room.workflow_stage_id if room else None,
                type=ctype,
                title=title,
                body=body,
                created_by_id=author.id,
                created_at=TODAY - timedelta(days=days_ago),
            )
            if resolved_by is not None:
                comment.status = CommentStatus.RESOLVED
                comment.resolved_by_id = resolved_by.id
                comment.resolved_at = TODAY - timedelta(days=resolved_days_ago or 0)
            db.add(comment)

        # Open markup/RFI thread on the room currently in Revision
        add_comment(
            richmond, apt102_kitchen, CommentType.BLOCKER,
            "Fridge panel projection doesn't match the appliance spec sheet — need the "
            "updated cutout dimensions before this can be corrected.",
            manager, 2, title="Fridge panel projection markup",
        )
        add_comment(
            richmond, apt102_kitchen, CommentType.RFI,
            "Can we confirm the finished sink cabinet width — drawing shows 900mm but the "
            "appliance schedule implies 950mm is needed for the specified sink.",
            team_leader, 2, title="Sink cabinet width",
        )
        add_comment(
            richmond, apt102_kitchen, CommentType.NOTE,
            "Handle profile also flagged on the markup — confirmed with client it's a minor "
            "note, not blocking.",
            sarah, 1,
        )
        # A resolved RFI on the same room, for contrast
        add_comment(
            richmond, apt102_kitchen, CommentType.RFI,
            "Confirming benchtop overhang at the island — architect responded 40mm, as drawn.",
            sarah, 9, title="Island benchtop overhang", resolved_by=team_leader, resolved_days_ago=8,
        )
        # A project-level blocker not tied to any single room
        add_comment(
            richmond, None, CommentType.BLOCKER,
            "Waiting on the client to finalise the wardrobe hardware selection for the "
            "whole building — affects every apartment's wardrobe room.",
            team_leader, 4, title="Wardrobe hardware selection outstanding",
        )
        # A note on the Smith Residence laundry, currently in Internal Review
        add_comment(
            smith, smith_laundry, CommentType.NOTE,
            "Laundry chute confirmed not required per latest client walkthrough.",
            mike, 3,
        )

        db.commit()

        print("Seed complete.")
        print("  admin@detailflow.dev / password123 (Admin)")
        print("  manager@detailflow.dev / password123 (Manager)")
        print("  teamleader@detailflow.dev / password123 (Team Leader)")
        print("  sarah@detailflow.dev / password123 (Detailer)")
        print("  john@detailflow.dev / password123 (Detailer)")
        print("  mike@detailflow.dev / password123 (Detailer)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
