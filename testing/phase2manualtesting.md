Manual End-to-End Test Checklist
 Try each role against every other role’s route.
Try opening another stage’s detail URL directly.
Try invoking stage actions with an incorrect role.
Try accessing another user’s claimed evaluation.
Confirm all unauthorized attempts are rejected server-side.
Confirm inactive and locked users cannot perform workflow actions.
Navigation

Log in separately as Administrator, HR, Supervisor, Reviewing Supervisor, Committee, and President.
Confirm each role sees only its authorized sidebar items.
Open every visible sidebar link.
Confirm no visible link leads to an unauthorized, broken, or placeholder page.
Confirm logout and subsequent login work correctly.
Employee Step 1

Open the active public evaluation link.
Enter a valid existing employee profile.
Confirm profile verification succeeds.
Confirm invalid or inactive profiles are rejected.
Confirm employee A–J ratings require values from 1–5.
Try submitting without a signature.
Submit with a valid signature.
Confirm the evaluation is created as EMPLOYEE_SUBMITTED.
Confirm a second submission for the same employee and cycle is blocked.
Confirm the employee profile itself is not changed.
Rater Step 2

Log in as a Supervisor.
Confirm the submitted evaluation appears in the queue.
Open the evaluation. (the upper part is perfectly working)








not working and current at steps and it has error: 
Confirm employee ratings are read-only.
Enter Supervisor ratings and all development fields.
Save a draft and reload the page.
Confirm draft data persists.
Try submitting with missing ratings, missing fields, or no signature.
Confirm submission is rejected.
Submit valid Step 2 data with a signature.
Confirm status becomes REVIEWING_SUPERVISOR_REVIEW.
Reviewing Supervisor

Log in as Reviewing Supervisor.
Confirm the evaluation appears in the Step 3 queue.
Open it and confirm previous-stage information is read-only.
Confirm another Reviewing Supervisor cannot access an evaluation already claimed by a different user.
Save a Step 3 draft.
Try submitting without comments, recommendations, or signature.
Submit valid Step 3 data.
Confirm status becomes PERSONNEL_PROCESSING.
Personnel Office

Log in as HR/Personnel.
Confirm the evaluation appears in the Personnel queue.
Confirm salary and personnel fields are visible only to the authorized role.
Save a draft and reload.
Try submitting without required salary, total points, adjective rating, recommendation, or signature.
Submit valid personnel data.
Confirm status becomes COMMITTEE_REVIEW.
Committee

Log in as Committee.
Confirm the evaluation appears in the Committee queue.
Confirm prior-stage data is read-only.
Test all final actions:
Retain
Transfer
Promote
Increase Salary
Training Required
Other
Select Other without details and confirm rejection.
Submit without recommendation or signature and confirm rejection.
Submit valid Committee review.
Confirm status becomes PRESIDENT_APPROVAL.
President

Log in as President.
Confirm the evaluation does not appear before Committee submission.
Confirm it appears after Committee submission.
Try approving without a signature.
Approve with a valid signature.
Confirm status becomes FINALIZED.
Confirm finalization metadata and final document behavior.
Confirm finalized fields cannot be edited.
Correction and Re-Review

From President approval, choose Return for correction.
Confirm a reason is required.
Confirm a correction target stage is required.
Return the evaluation to each supported stage individually.
Confirm the evaluation appears only in the selected stage queue.
Confirm other stage users cannot open or modify it.
Correct the required data.
Resubmit and confirm the workflow continues from that stage.
Confirm audit history preserves the original submission, return, correction, and re-review events.
Confirm the evaluation cannot skip directly to President approval.
Notifications and Audit

Verify notifications after:
Employee submission
Rater submission
Step 3 submission
Personnel submission
Committee submission
President approval
President return
Correction and re-review
Finalization
Confirm each notification reaches the correct role/stage.
Confirm every transition appears in the evaluation history and audit logs.
Unauthorized Access

Try each role against every other role’s route.
Try opening another stage’s detail URL directly.
Try invoking stage actions with an incorrect role.
Try accessing another user’s claimed evaluation.
Confirm all unauthorized attempts are rejected server-side.
Confirm inactive and locked users cannot perform workflow actions.
Navigation

Log in separately as Administrator, HR, Supervisor, Reviewing Supervisor, Committee, and President.
Confirm each role sees only its authorized sidebar items.
Open every visible sidebar link.
Confirm no visible link leads to an unauthorized, broken, or placeholder page.
Confirm logout and subsequent login work correctly.