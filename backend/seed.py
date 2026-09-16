"""Development seed data — NOT for production use.

Run with: python seed.py  (inside the backend venv, DATABASE_URL configured)

Creates the users, projects, apartments and rooms described in spec §46 so
the UI (dashboard, projects list, project detail, room detail) has realistic
data to render against. Safe to re-run: it clears and recreates the tables
it owns.
"""
from datetime import date, datetime, time, timedelta, timezone

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.apartment import Apartment
from app.models.batch import Batch
from app.models.comment import Comment
from app.models.enums import (
    ApartmentStatus,
    BatchStatus,
    CommentStatus,
    CommentType,
    Priority,
    ProjectStatus,
    RoomWorkflowStatus,
    StageTransitionOutcome,
    TimeEntrySource,
    UserRole,
)
from app.models.notification import Notification
from app.models.plan_entry import PlanEntry
from app.models.project import Project
from app.models.project_assignment import ProjectAssignment
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.time_entry import TimeEntry
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
        # Notifications must go before users — notifications.user_id is
        # ON DELETE RESTRICT (same reasoning as Batch.nester_id, see
        # docs/ARCHITECTURE.md §6), so a leftover notification row would
        # otherwise block `db.query(User).delete()` below. Its room_id/
        # project_id FKs are nullable/SET NULL so they don't block those
        # deletes either way, but clearing it first (rather than relying on
        # that) keeps this table's cleanup next to the same reasoning as the
        # Batch comment above.
        db.query(Notification).delete()
        # PlanEntry.room_id/batch_id are both ON DELETE CASCADE (see
        # app/models/plan_entry.py — neither can be SET NULL without
        # violating the model's room-xor-batch CHECK constraint), so this
        # would clear itself once Batch/Room are deleted below regardless —
        # cleared explicitly anyway, same "don't just rely on it" style as
        # the Batch/Notification comments here.
        db.query(PlanEntry).delete()
        db.query(Comment).delete()
        db.query(RoomStageEvent).delete()
        # Batches must go before rooms/projects — batches.project_id is
        # ON DELETE RESTRICT (same reasoning as apartments/rooms -> projects,
        # see docs/ARCHITECTURE.md §6), and rooms.batch_id is nullable/SET
        # NULL so it doesn't block a room delete, but a batch row itself
        # still has to be cleared explicitly before its project can go.
        db.query(Batch).delete()
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
        project_manager_user = User(
            email="pm@detailflow.dev",
            full_name="Priya Mehta",
            role=UserRole.PROJECT_MANAGER,
            hashed_password=hash_password("password123"),
        )
        nester = User(
            email="nester@detailflow.dev",
            full_name="Noah Estrada",
            role=UserRole.NESTER,
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
        db.add_all([admin, manager, team_leader, project_manager_user, nester, sarah, john, mike])
        db.commit()

        ifa_drafted = stage_by_key(db, "ifa_drafted")
        ifa_internal_review = stage_by_key(db, "ifa_internal_review")
        ifa_issued = stage_by_key(db, "ifa_issued")
        ifa_revision = stage_by_key(db, "ifa_revision")
        ifc_drafted = stage_by_key(db, "ifc_drafted")
        ifc_internal_review = stage_by_key(db, "ifc_internal_review")
        ifc_issued = stage_by_key(db, "ifc_issued")
        ifc_revision = stage_by_key(db, "ifc_revision")
        complete = stage_by_key(db, "complete")

        # ---- Richmond Apartments ----
        print("Seeding Richmond Apartments...")
        richmond = Project(
            project_number="P-1001",
            name="Richmond Apartments",
            client_name="Richmond Developments Pty Ltd",
            builder="Hargrove Construction",
            site_address="45 Bridge Rd, Richmond VIC",
            project_manager_id=project_manager_user.id,
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
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifa_internal_review.id,
                 workflow_status=RoomWorkflowStatus.READY_FOR_REVIEW,
                 priority=Priority.HIGH, due_date=TODAY + timedelta(days=5), estimated_hours=14),
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Laundry",
                 assigned_detailer_id=sarah.id, workflow_stage_id=complete.id,
                 workflow_status=RoomWorkflowStatus.COMPLETE,
                 due_date=TODAY - timedelta(days=2), estimated_hours=4),
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Ensuite",
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.IN_PROGRESS,
                 due_date=TODAY + timedelta(days=4), estimated_hours=6),
            Room(project_id=richmond.id, apartment_id=apt_101.id, name="Wardrobe",
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=6), estimated_hours=3),
            # Apartment 102 — kitchen came back with client markups, now in IFA Revision
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Kitchen",
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifa_revision.id,
                 workflow_status=RoomWorkflowStatus.CHANGES_REQUIRED,
                 priority=Priority.HIGH, due_date=TODAY + timedelta(days=3), estimated_hours=14),
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Laundry",
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifc_issued.id,
                 workflow_status=RoomWorkflowStatus.READY_FOR_REVIEW,
                 due_date=TODAY + timedelta(days=1), estimated_hours=4),
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Ensuite",
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.IN_PROGRESS,
                 due_date=TODAY + timedelta(days=7), estimated_hours=6),
            Room(project_id=richmond.id, apartment_id=apt_102.id, name="Wardrobe",
                 assigned_detailer_id=sarah.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=8), estimated_hours=3),
            # Apartment 103 — waiting on the client for information, blocked feel
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Kitchen",
                 assigned_detailer_id=john.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.WAITING,
                 priority=Priority.URGENT, due_date=TODAY + timedelta(days=2), estimated_hours=14),
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Laundry",
                 assigned_detailer_id=john.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.WAITING,
                 due_date=TODAY + timedelta(days=2), estimated_hours=4),
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Ensuite",
                 assigned_detailer_id=john.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=9), estimated_hours=6),
            Room(project_id=richmond.id, apartment_id=apt_103.id, name="Wardrobe",
                 assigned_detailer_id=john.id, workflow_stage_id=ifa_drafted.id,
                 workflow_status=RoomWorkflowStatus.NOT_STARTED,
                 due_date=TODAY + timedelta(days=9), estimated_hours=3),
        ]
        db.add_all(richmond_rooms)
        db.flush()

        apt101_kitchen = richmond_rooms[0]
        apt102_kitchen = richmond_rooms[4]
        apt102_laundry = richmond_rooms[5]
        apt103_kitchen = richmond_rooms[7]

        # ---- Smith Residence ----
        print("Seeding Smith Residence...")
        smith = Project(
            project_number="P-1002",
            name="Smith Residence",
            client_name="John & Kate Smith",
            builder="Coastal Homes",
            site_address="12 Seaview Ct, Mornington VIC",
            project_manager_id=project_manager_user.id,
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
                 workflow_stage_id=ifa_drafted.id, workflow_status=RoomWorkflowStatus.IN_PROGRESS,
                 priority=Priority.HIGH, due_date=TODAY + timedelta(days=6), estimated_hours=16),
            Room(project_id=smith.id, name="Butler's Pantry", assigned_detailer_id=mike.id,
                 workflow_stage_id=ifa_drafted.id, workflow_status=RoomWorkflowStatus.WAITING,
                 due_date=TODAY + timedelta(days=10), estimated_hours=8),
            Room(project_id=smith.id, name="Laundry", assigned_detailer_id=mike.id,
                 workflow_stage_id=ifa_internal_review.id, workflow_status=RoomWorkflowStatus.READY_FOR_REVIEW,
                 due_date=TODAY + timedelta(days=4), estimated_hours=4),
            Room(project_id=smith.id, name="Walk-in Robe", assigned_detailer_id=mike.id,
                 workflow_stage_id=ifa_drafted.id, workflow_status=RoomWorkflowStatus.NOT_STARTED,
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

        # ---- A couple of stage bumps purely for Planning-page color variety ----
        # apt103 Laundry -> IFC Drafted: a standalone room genuinely sitting in
        # the IFC cycle but NOT in any batch, so the Planning page's "+ add
        # task" picker has a real orange (IFC) room to assign, separate from
        # apt102_laundry below which becomes batch-eligible work instead.
        apt103_laundry = richmond_rooms[9]
        apt103_laundry.workflow_stage_id = ifc_drafted.id
        apt103_laundry.workflow_stage = ifc_drafted
        apt103_laundry.workflow_status = RoomWorkflowStatus.IN_PROGRESS
        apt103_laundry.progress = round((ifc_drafted.sequence / total_stages) * 100)

        # Smith Laundry -> IFC Issued: makes it batch-eligible (see Batches
        # below) instead of sitting in IFA Internal Review as originally
        # seeded — the Planning demo needs a second IFC-approved room to
        # group into a Batch alongside apt102_laundry.
        smith_laundry.workflow_stage_id = ifc_issued.id
        smith_laundry.workflow_stage = ifc_issued
        smith_laundry.workflow_status = RoomWorkflowStatus.READY_FOR_REVIEW
        smith_laundry.progress = round((ifc_issued.sequence / total_stages) * 100)
        db.commit()

        # ---- Batches: group the two now-IFC-approved rooms above, one per
        # project, into a Nester-created Batch each — gives the Planning page
        # a real green (BOM) and a real yellow (Nesting) task to assign. ----
        print("Seeding batches...")
        richmond_batch = Batch(
            project_id=richmond.id,
            batch_number=1,
            status=BatchStatus.BOM_PENDING,
            nester_id=nester.id,
        )
        smith_batch = Batch(
            project_id=smith.id,
            batch_number=1,
            status=BatchStatus.NESTING,
            nester_id=nester.id,
        )
        db.add_all([richmond_batch, smith_batch])
        db.flush()
        apt102_laundry.batch_id = richmond_batch.id
        smith_laundry.batch_id = smith_batch.id
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

        # Apartment 101 Kitchen: clean run so far, currently in IFA Internal Review
        add_event(apt101_kitchen, None, ifa_drafted, sarah, 6)
        add_event(apt101_kitchen, ifa_drafted, ifa_internal_review, team_leader, 3)

        # Apartment 102 Kitchen: IFA went all the way out to the client and came
        # back with markups — sits in IFA Revision, looping back to IFA Drafted
        # (redrafting the IFA package).
        add_event(apt102_kitchen, None, ifa_drafted, sarah, 10)
        add_event(apt102_kitchen, ifa_drafted, ifa_internal_review, sarah, 9)
        add_event(
            apt102_kitchen, ifa_internal_review, ifa_issued, team_leader, 7,
            outcome=StageTransitionOutcome.APPROVED,
            note="Internally reviewed, no issues — issuing to the client for approval.",
        )
        add_event(
            apt102_kitchen, ifa_issued, ifa_revision, manager, 2,
            outcome=StageTransitionOutcome.MARKUPS_REQUIRED,
            note="Client marked up the fridge panel projection and sink cabinet width — see RFI.",
        )

        # Apartment 102 Laundry: sailed through both IFA and IFC review with no
        # markups and is now sitting at IFC Issued — PM notified, no client
        # gate required here, just waiting to be marked Complete.
        add_event(apt102_laundry, None, ifa_drafted, sarah, 16)
        add_event(apt102_laundry, ifa_drafted, ifa_internal_review, sarah, 14)
        add_event(
            apt102_laundry, ifa_internal_review, ifa_issued, team_leader, 13,
            outcome=StageTransitionOutcome.APPROVED,
            note="Clean internal review — issuing to the client for approval.",
        )
        add_event(
            apt102_laundry, ifa_issued, ifc_drafted, manager, 11,
            outcome=StageTransitionOutcome.APPROVED,
            note="Client approved with no comments — proceeding to IFC.",
        )
        add_event(apt102_laundry, ifc_drafted, ifc_internal_review, sarah, 6)
        add_event(
            apt102_laundry, ifc_internal_review, ifc_issued, team_leader, 4,
            note="IFC internally reviewed and issued — PM notified.",
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

        # Open markup/RFI thread on the room currently in IFA Revision
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
        # A note on the Smith Residence laundry, now in Batch 1's nesting run
        add_comment(
            smith, smith_laundry, CommentType.NOTE,
            "Laundry chute confirmed not required per latest client walkthrough.",
            mike, 3,
        )

        db.commit()

        # ---- Report demo data: more revision/variation/batch-completion
        # variety, plus time logged across every detailer, so the Reports
        # page's new metrics (hours per detailer, logged-vs-estimated burn,
        # revision/variation counts, batch throughput) have something real
        # to show instead of near-zeros. Deliberately touches only rooms
        # that no PlanEntry/Batch seeded above already points at (apt103
        # Ensuite/Wardrobe below are richmond_rooms[10]/[11] — the mislabeled
        # `apt103_kitchen = richmond_rooms[7]` a few lines up is untouched,
        # left exactly as it already was) — see docs/ARCHITECTURE.md §12.3
        # for the reports these feed. ----
        print("Seeding report demo data (revisions, a variation, a completed batch, time entries)...")

        apt103_ensuite_room = richmond_rooms[10]
        apt103_wardrobe_room = richmond_rooms[11]
        apt103_kitchen_room = richmond_rooms[8]
        smith_walkin_robe = smith_rooms[3]

        # apt103 Ensuite: a full IFA->IFC pass that comes back as an IFC
        # Revision — a client-requested late change after sign-off, i.e. a
        # Variation (see docs/ARCHITECTURE.md §21.3), not a markup catch.
        add_event(apt103_ensuite_room, None, ifa_drafted, john, 26)
        add_event(apt103_ensuite_room, ifa_drafted, ifa_internal_review, team_leader, 24)
        add_event(
            apt103_ensuite_room, ifa_internal_review, ifa_issued, team_leader, 22,
            outcome=StageTransitionOutcome.APPROVED,
            note="Internal review clean — issuing to the client for approval.",
        )
        add_event(
            apt103_ensuite_room, ifa_issued, ifc_drafted, manager, 20,
            outcome=StageTransitionOutcome.APPROVED,
            note="Client approved with no comments — proceeding to IFC.",
        )
        add_event(apt103_ensuite_room, ifc_drafted, ifc_internal_review, john, 15)
        add_event(
            apt103_ensuite_room, ifc_internal_review, ifc_issued, team_leader, 12,
            note="IFC internally reviewed and issued — PM notified.",
        )
        add_event(
            apt103_ensuite_room, ifc_issued, ifc_revision, manager, 5,
            note="Client requested a late change to the ensuite niche height after "
            "IFC sign-off — logged as a Variation, not a Revision.",
        )
        apt103_ensuite_room.workflow_stage_id = ifc_revision.id
        apt103_ensuite_room.workflow_stage = ifc_revision
        apt103_ensuite_room.workflow_status = RoomWorkflowStatus.CHANGES_REQUIRED
        apt103_ensuite_room.progress = round((ifc_revision.sequence / total_stages) * 100)
        add_comment(
            richmond, apt103_ensuite_room, CommentType.VARIATION,
            "Client requested the ensuite niche height be raised by 50mm after IFC "
            "sign-off — redrafting the IFC package to suit.",
            project_manager_user, 5, title="Ensuite niche height change",
        )

        # Smith Walk-in Robe: an IFA revision loop (client markups on the
        # shelf configuration) — gives Smith its own revision, not just Richmond's.
        add_event(smith_walkin_robe, None, ifa_drafted, mike, 20)
        add_event(smith_walkin_robe, ifa_drafted, ifa_internal_review, team_leader, 18)
        add_event(
            smith_walkin_robe, ifa_internal_review, ifa_issued, team_leader, 16,
            outcome=StageTransitionOutcome.APPROVED,
            note="Internal review clean — issuing to the client for approval.",
        )
        add_event(
            smith_walkin_robe, ifa_issued, ifa_revision, manager, 10,
            outcome=StageTransitionOutcome.MARKUPS_REQUIRED,
            note="Client marked up the robe shelf configuration — redrafting IFA.",
        )
        smith_walkin_robe.workflow_stage_id = ifa_revision.id
        smith_walkin_robe.workflow_stage = ifa_revision
        smith_walkin_robe.workflow_status = RoomWorkflowStatus.CHANGES_REQUIRED
        smith_walkin_robe.progress = round((ifa_revision.sequence / total_stages) * 100)

        # apt103 Wardrobe: a clean run all the way to Complete, grouped into a
        # second Richmond batch that's already finished — gives batch
        # throughput a real completed batch (and a real creation->completion
        # duration) to report on, without touching richmond_batch/smith_batch
        # above (both still exactly as the Planning page's seed data expects).
        add_event(apt103_wardrobe_room, None, ifa_drafted, john, 30)
        add_event(apt103_wardrobe_room, ifa_drafted, ifa_internal_review, team_leader, 28)
        add_event(
            apt103_wardrobe_room, ifa_internal_review, ifa_issued, team_leader, 26,
            outcome=StageTransitionOutcome.APPROVED,
            note="Internal review clean — issuing to the client for approval.",
        )
        add_event(
            apt103_wardrobe_room, ifa_issued, ifc_drafted, manager, 24,
            outcome=StageTransitionOutcome.APPROVED,
            note="Client approved with no comments — proceeding to IFC.",
        )
        add_event(apt103_wardrobe_room, ifc_drafted, ifc_internal_review, john, 21)
        add_event(
            apt103_wardrobe_room, ifc_internal_review, ifc_issued, team_leader, 20,
            note="IFC internally reviewed and issued — PM notified.",
        )
        add_event(
            apt103_wardrobe_room, ifc_issued, complete, nester, 10,
            note="Batch 2 complete — cascaded to Complete.",
        )
        apt103_wardrobe_room.workflow_stage_id = complete.id
        apt103_wardrobe_room.workflow_stage = complete
        apt103_wardrobe_room.workflow_status = RoomWorkflowStatus.COMPLETE
        apt103_wardrobe_room.progress = 100

        richmond_batch2 = Batch(
            project_id=richmond.id,
            batch_number=2,
            status=BatchStatus.COMPLETE,
            nester_id=nester.id,
            created_at=datetime.combine(TODAY - timedelta(days=20), time(9, 0), tzinfo=timezone.utc),
            updated_at=datetime.combine(TODAY - timedelta(days=10), time(16, 0), tzinfo=timezone.utc),
        )
        db.add(richmond_batch2)
        db.flush()
        apt103_wardrobe_room.batch_id = richmond_batch2.id
        db.commit()

        def add_time_entry(room, user, days_ago, start_hour, duration_minutes, note=None):
            start = datetime.combine(TODAY - timedelta(days=days_ago), time(start_hour, 0), tzinfo=timezone.utc)
            db.add(
                TimeEntry(
                    room_id=room.id,
                    user_id=user.id,
                    started_at=start,
                    ended_at=start + timedelta(minutes=duration_minutes),
                    duration_minutes=duration_minutes,
                    source=TimeEntrySource.MANUAL,
                    note=note,
                )
            )

        # Sarah — Richmond (Apartment 101/102 kitchens)
        add_time_entry(apt101_kitchen, sarah, 2, 9, 300, "IFA package cleanup")
        add_time_entry(apt101_kitchen, sarah, 10, 13, 180)
        add_time_entry(apt102_kitchen, sarah, 3, 9, 240, "Redrafting after client markups")
        add_time_entry(apt102_kitchen, sarah, 20, 9, 360)

        # John — Richmond (Apartment 103)
        add_time_entry(apt103_kitchen_room, john, 1, 8, 180)
        add_time_entry(apt103_kitchen_room, john, 6, 8, 300)
        add_time_entry(apt103_laundry, john, 15, 9, 240)
        add_time_entry(apt103_ensuite_room, john, 8, 8, 200, "Early modelling before the revision loop")

        # Mike — Smith Residence
        add_time_entry(smith_rooms[0], mike, 2, 9, 240)
        add_time_entry(smith_rooms[1], mike, 12, 9, 120)
        add_time_entry(smith_laundry, mike, 5, 9, 180)
        add_time_entry(smith_walkin_robe, mike, 30, 9, 300)
        add_time_entry(smith_walkin_robe, mike, 45, 9, 240)
        # A one-off bulk backfill of pre-time-tracking hours — deliberately
        # large enough to push Smith Residence's logged total past its
        # estimate, so the burn comparison has a real "over" example to show
        # alongside Richmond's "under" one.
        add_time_entry(
            smith_rooms[0], mike, 35, 7, 2700,
            "Bulk backfill of historical shop-drawing hours from before time "
            "tracking rolled out",
        )

        db.commit()

        # ---- Plan entries: a Mon-Fri spread of example day-level planning
        # tasks, one of each color category, plus one worked/one not-worked
        # past-day example. TODAY is a Tuesday in this environment, so
        # TODAY-1..TODAY+3 lands Mon-Fri without any weekday arithmetic —
        # acceptable for seed data (see the comment on richmond_rooms above
        # for the same kind of TODAY-relative shortcut used throughout this
        # file), not something a real user-facing feature could assume. ----
        print("Seeding plan entries...")
        monday, tuesday, wednesday, thursday, friday = (
            TODAY - timedelta(days=1),
            TODAY,
            TODAY + timedelta(days=1),
            TODAY + timedelta(days=2),
            TODAY + timedelta(days=3),
        )
        # ifa_drafted — every room starts life here now (§24 simplified away
        # the old pre-drafting stages that used to render "New Project"/no
        # colour on the Planning grid), so these are just two more purple
        # IFA examples rather than a distinct category.
        apt102_ensuite = richmond_rooms[6]
        apt101_wardrobe = richmond_rooms[3]
        apt101_laundry = richmond_rooms[1]  # complete — the muted "done" treatment

        db.add_all(
            [
                # Monday (past) — Sarah worked this room that day: a real
                # TimeEntry backs it, so the chip should render "worked".
                PlanEntry(
                    user_id=sarah.id, date=monday, room_id=apt101_kitchen.id, position=0,
                    note="IFA internal review follow-up", created_by_id=team_leader.id,
                ),
                # Monday (past) — John was planned on this IFC-stage room but
                # logged nothing that day: the chip should render "not worked".
                PlanEntry(
                    user_id=john.id, date=monday, room_id=apt103_laundry.id, position=0,
                    created_by_id=team_leader.id,
                ),
                # Tuesday (today) — a fresh IFA-drafted room each for Sarah
                # and John, plus the Nester's own BOM batch task.
                PlanEntry(
                    user_id=sarah.id, date=tuesday, room_id=apt102_ensuite.id, position=0,
                    created_by_id=manager.id,
                ),
                PlanEntry(
                    user_id=john.id, date=tuesday, room_id=apt101_wardrobe.id, position=0,
                    created_by_id=manager.id,
                ),
                PlanEntry(
                    user_id=nester.id, date=tuesday, batch_id=richmond_batch.id, position=0,
                    note="BOM for Batch 1", created_by_id=manager.id,
                ),
                # Wednesday — Sarah has two tasks the same day (the "multiple
                # rows inside each day" case): the IFA-revision kitchen plus
                # the already-Complete laundry (muted/done treatment, a plan
                # made back when it was still in progress).
                PlanEntry(
                    user_id=sarah.id, date=wednesday, room_id=apt102_kitchen.id, position=0,
                    note="Redraft after client markups", created_by_id=team_leader.id,
                ),
                PlanEntry(
                    user_id=sarah.id, date=wednesday, room_id=apt101_laundry.id, position=1,
                    created_by_id=manager.id,
                ),
                # Thursday — Mike on the Smith kitchen (IFA), Noah on the
                # Smith batch's Nesting task.
                PlanEntry(
                    user_id=mike.id, date=thursday, room_id=smith_rooms[0].id, position=0,
                    created_by_id=manager.id,
                ),
                PlanEntry(
                    user_id=nester.id, date=thursday, batch_id=smith_batch.id, position=0,
                    note="Nesting run for Batch 1", created_by_id=manager.id,
                ),
                # Friday — John back on the IFC-stage laundry (orange), a
                # second day of work planned on the same room.
                PlanEntry(
                    user_id=john.id, date=friday, room_id=apt103_laundry.id, position=0,
                    created_by_id=manager.id,
                ),
            ]
        )
        # Planning also assigns (see app/services/plan_service.py::create_entry) —
        # mirror that side effect here since seed.py builds these directly via
        # the ORM rather than the API/service layer.
        apt101_kitchen.assigned_detailer_id = sarah.id
        apt103_laundry.assigned_detailer_id = john.id
        apt102_ensuite.assigned_detailer_id = sarah.id
        apt101_wardrobe.assigned_detailer_id = john.id
        apt102_kitchen.assigned_detailer_id = sarah.id
        apt101_laundry.assigned_detailer_id = sarah.id
        smith_rooms[0].assigned_detailer_id = mike.id
        db.commit()

        # A real TimeEntry backing Monday's apt101_kitchen plan entry, so
        # that room's Monday chip shows the "worked" indicator; John's
        # Monday apt103_laundry entry deliberately gets no TimeEntry, so its
        # chip shows "not worked" — the same green/red judgment §19 made for
        # whole projects/weeks, adapted to a single room/day (see
        # app/services/plan_service.py::logged_minutes_map).
        db.add(
            TimeEntry(
                room_id=apt101_kitchen.id,
                user_id=sarah.id,
                started_at=datetime.combine(monday, time(9, 0), tzinfo=timezone.utc),
                ended_at=datetime.combine(monday, time(12, 30), tzinfo=timezone.utc),
                duration_minutes=210,
                source=TimeEntrySource.MANUAL,
                note="IFA internal review follow-up",
            )
        )
        db.commit()

        print("Seed complete.")
        print("  admin@detailflow.dev / password123 (Admin)")
        print("  manager@detailflow.dev / password123 (Manager)")
        print("  teamleader@detailflow.dev / password123 (Team Leader)")
        print("  pm@detailflow.dev / password123 (Project Manager)")
        print("  nester@detailflow.dev / password123 (Nester)")
        print("  sarah@detailflow.dev / password123 (Detailer)")
        print("  john@detailflow.dev / password123 (Detailer)")
        print("  mike@detailflow.dev / password123 (Detailer)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
