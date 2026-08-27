# Performance Review Hub

Create a new enterprise-ready web application named “Performance Evaluation System” from the beginning.



Build Phases 1–4 as one integrated implementation. Do not create a separate application and do not build features outside this scope.



TECHNOLOGY STACK



Use:

- React

- TypeScript

- Vite

- TanStack Router

- Tailwind CSS

- shadcn/ui

- Supabase

- PostgreSQL

- Supabase Auth

- PostgreSQL Row Level Security

- Application-level RBAC

- TanStack Query

- React Hook Form

- Zod

- TanStack Table

- Recharts only when necessary



Do not use Google Forms, Google Sheets, Google APIs, Firebase, external form providers, employee accounts, employee dashboards, Pending Employee status, employee assignment restrictions, or a separate Employee Profile module.



SYSTEM USERS



Only these internal users may have accounts:

- Administrator

- President

- HR/Personnel

- Supervisor



Employees/ratees must not have login accounts, passwords, dashboards, or permanent sessions.



The employee/ratee will access Step 1 through an annual QR code/link created by HR.



APPROVED WORKFLOW



1. HR creates an annual evaluation cycle.

2. HR selects the approved Performance Evaluation Factor template.

3. HR activates the cycle.

4. The system generates one shared annual QR code/link.

5. Employees scan the QR code/link.

6. Employees complete the built-in Step 1 assessment.

7. The submitted Step 1 assessment becomes available to every authorized Supervisor.

8. Supervisors are not restricted by employee assignment, department, section, unit, or employee mapping.

9. A Supervisor reviews the employee Step 1 assessment and completes the Supervisor rating section.

10. The Supervisor submits the completed assessment to the President.

11. The assessment appears in the President queue.

12. The President completes Step 2 and Step 3.

13. Final scoring, finalization, PDF generation, reports, and AI recommendations will be implemented in a later phase.



Do not implement a Supervisor assignment workflow. Every authorized Supervisor must receive all completed employee Step 1 assessments.



ROUTES



Create these route groups:



Public:

- /evaluation/:cycleToken



Authentication:

- /login

- /forgot-password

- /reset-password



Administrator:

- /admin

- /admin/users

- /admin/roles

- /admin/audit-logs



HR:

- /hr

- /hr/evaluation-cycles

- /hr/evaluation-cycles/:cycleId



Supervisor:

- /supervisor

- /supervisor/evaluations

- /supervisor/evaluations/:evaluationId



President:

- /president

- /president/evaluations

- /president/evaluations/:evaluationId



Shared:

- /unauthorized

- Not Found page

- Evaluation link unavailable page

- Submission success page



PHASE 1 — APPLICATION FOUNDATION



Build a professional, responsive, accessible enterprise interface for desktop, tablet, and mobile.



Use TanStack Router for routing and TanStack Query for server state.



Use React Hook Form and Zod for all forms and validation.



Use reusable shadcn/ui and Tailwind components for:

- Layout

- Header

- Sidebar

- Breadcrumbs

- Tables

- Search

- Filters

- Pagination

- Sort controls

- Status badges

- Forms

- Dialogs

- Confirmation modals

- Loading states

- Empty states

- Error states

- Unauthorized states

- Toast notifications



Use clear separation between:

- UI components

- Routing

- Query and mutation logic

- Validation

- Authorization

- Business rules

- Supabase data access



Do not use unrelated sample modules or placeholder data from other systems.



PHASE 1 — DATA AND BACKEND FOUNDATION



Connect the application to Supabase PostgreSQL.



Use enterprise database practices:

- Normalized relational design

- Primary keys

- Foreign keys

- Unique constraints

- Check constraints

- Referential integrity

- Appropriate indexes

- Safe delete behavior

- UTC timestamps

- created_at and updated_at fields

- Database transactions

- Idempotent operations

- Optimistic concurrency where needed

- Safe migrations

- Strong TypeScript data types



Prepare the backend for:

- Internal users

- Roles

- Permissions

- User-role assignments

- Role-permission assignments

- Employees

- Evaluation templates

- Evaluation criteria

- Evaluation cycles

- Annual evaluations

- Evaluation ratings

- Evaluation workflow events

- Audit logs

- Login events

- Password-reset events



EMPLOYEE RECORD RULES



Do not create a separate Employee Profile module or concept.



Use an employees record as the permanent employee record.



The employee record must support:

- Employee Number

- Full Name

- Job Title

- Division/Department

- Section/Unit

- Employment status

- Created timestamp

- Updated timestamp



An employee record is not an authentication account.



The future Step 1 form must require:

- Employee Number

- Full Name

- Job Title

- Division/Department

- Section/Unit



For a first-time employee:

- Search using Employee Number and Full Name.

- If no matching employee exists, create the employee record and current annual evaluation in one secure transaction.

- Do not create a Pending Employee status.

- Do not create an employee account.



For a returning employee:

- Match Employee Number and Full Name to the existing employee record.

- Reuse the existing employee record.

- Create a new annual evaluation for the current annual cycle.

- Do not create a duplicate employee record merely because the year changed.



Preserve the employee-submitted Job Title, Division/Department, and Section/Unit as a snapshot in each annual evaluation so historical records remain accurate.



Use these integrity rules:

- Employee Number must be unique.

- One employee may have only one annual evaluation per annual cycle.

- One evaluation may have only one rating per criterion and evaluator type.

- Ratings must be integers from 1 through 5.

- Finalized evaluations must be protected from ordinary updates.



PHASE 1 — PERFORMANCE EVALUATION FACTOR TEMPLATE



Create the official Performance Evaluation Factor template with exactly these ten criteria:



A. QUALITY OF WORK. Consider the neatness, accuracy, and completeness of the employee’s work in relation to company standards.



B. QUANTITY OF WORK. Consider the volume of work done by the employee and the speed at which work was satisfactorily completed.



C. JOB KNOWLEDGE. Consider the employee’s skill, knowledge, and understanding of the details of regularly assigned work.



D. ABILITY TO LEARN. Consider the employee’s ability to learn new job procedures and methods and the speed at which the employee grasps instructions.



E. DEPENDABILITY. Consider the employee’s attendance, punctuality, and the seriousness with which the employee performs duties.



F. INITIATIVE. Consider the employee’s resourcefulness or ability to develop new approaches to problems as required by the job.



G. HUMAN RELATIONS/TEAMWORK. Consider the employee’s ability to get along with co-employees and clients and the employee’s sense of organizational loyalty.



H. COST CONSCIOUSNESS. Consider the employee’s attitude toward cost objectives in relation to work, efforts at preventing waste, and efforts at generating cost savings.



I. DISCIPLINE. Consider the employee’s conduct on the job, attitude toward company rules, and efforts at promoting harmonious relationships among others.



J. SAFETY CONSCIOUSNESS/CARE OF EQUIPMENT. Consider the manner in which the employee handles themselves, materials, and equipment in a work situation and the employee’s safety consciousness.



Use this rating scale:

- 1 = Poor

- 2 = Below Average

- 3 = Average

- 4 = Above Average

- 5 = Excellent



Each criterion must appear as one row in a 1–5 rating matrix.



Each row must use five mutually exclusive radio-button options. Exactly one rating must be selected for each criterion.



Do not use checkboxes, sliders, dropdowns, multi-select controls, or inputs that permit more than one rating per criterion.



Support separate evaluator types:

- EMPLOYEE

- SUPERVISOR

- PRESIDENT



Employee, Supervisor, and President ratings must never overwrite one another.



PHASE 2 — AUTHENTICATION, USER MANAGEMENT, RBAC, RLS, AND SECURITY



Use Supabase Auth for internal users only.



Build:

- Login

- Logout

- Forgot-password flow

- Password reset through Supabase Auth

- First-login password setup

- Session handling

- Session expiration handling

- Account activation

- Account deactivation

- Account locking

- Account unlocking

- Password-reset-required status

- Session revocation after password reset or deactivation



Create these roles:

- Administrator

- President

- HR/Personnel

- Supervisor



Create granular permissions for:

- User management

- Role management

- Permission management

- Employee-record viewing

- Evaluation-template management

- Evaluation-cycle management

- QR/link management

- Employee Step 1 viewing

- Supervisor rating entry

- Supervisor submission to President

- President evaluation viewing

- President Step 2 completion

- President Step 3 completion

- Finalization for future use

- Audit-log viewing

- Reports for future use



The Administrator must be able to:

- Create internal users

- Edit internal-user information

- Assign roles

- Activate and deactivate users

- Lock and unlock users

- Reset passwords

- Require password changes

- Revoke sessions

- Configure role permissions

- View effective permissions



Technical Administrator authority must be separate from President evaluation authority. The Administrator does not automatically receive President permissions.



Protect the last active Administrator:

- Do not allow deactivation of the last Administrator.

- Do not allow removal of the final Administrator permission.

- Do not allow an Administrator to remove their own final Administrator access.

- Require confirmation and a reason for sensitive access changes.



RLS AND SERVER AUTHORIZATION



Implement both application-level RBAC and PostgreSQL RLS.



Enable RLS on all exposed application tables.



Deny access by default and grant only the minimum required access.



Authorization must be enforced in:

- Frontend navigation

- Route guards

- Server-side actions

- Supabase/PostgreSQL RLS policies



Do not rely on hidden buttons or frontend-only checks.



Access rules:

- Administrator manages authorized technical access and audit functions.

- HR manages annual evaluation cycles and QR/link operations according to permissions.

- Every authorized Supervisor can view all employee Step 1 assessments submitted through the active cycle.

- Supervisors are not restricted by assignment, department, unit, or employee mapping.

- Supervisors can enter their own Supervisor ratings and submit assessments to the President.

- Supervisors cannot edit employee ratings.

- Supervisors cannot edit President ratings.

- Supervisors cannot complete President Step 2 or Step 3.

- Supervisors cannot finalize evaluations.

- President can view all Supervisor-submitted assessments and complete Step 2 and Step 3.

- Employees can access only the public annual assessment form.



Never trust client-submitted:

- User role

- Permission

- Employee ID

- Cycle status

- Evaluation status

- Evaluator type

- Score

- Authorization decision



Use server-side authorization to determine what the user can access or modify.



Use Zod validation at client and server boundaries.



Use parameterized Supabase operations and safe error handling.



Never expose:

- Service-role keys

- Database passwords

- Private API keys

- Session secrets

- Password-reset tokens

- Private credentials



Use only the Supabase publishable frontend key. Keep privileged operations server-side.



PHASE 3 — HR ANNUAL EVALUATION CYCLE AND QR CODE/LINK



Build the HR annual evaluation-cycle module.



HR must be able to:

- Create an annual evaluation cycle

- Enter the cycle name

- Enter the evaluation year

- Select the official Performance Evaluation Factor template

- Set start date and time

- Set end date and time

- Save as Draft

- Activate the cycle

- Close the cycle

- Disable the cycle

- View cycle status

- View employee Step 1 submission count

- View Supervisor submission count

- View President queue count

- Preview the shared QR code

- Copy the annual assessment link

- Download the QR code image

- Regenerate the QR/link only through a confirmed and audited action



Use these cycle statuses:

- DRAFT

- ACTIVE

- CLOSED

- DISABLED



When HR activates the cycle:

- Generate one secure, cryptographically random, non-guessable cycle token.

- Generate one shared QR code linking to /evaluation/:cycleToken.

- Do not expose internal database IDs in the public link.

- Record QR/link creation in the audit log.

- The link must work only while the cycle is ACTIVE.

- The link must work only within the configured UTC start and end date/time.

- The link must stop working when expired, closed, disabled, invalid, or unavailable.



Do not create one QR code per employee.



Use confirmation and reason requirements for:

- Closing a cycle early

- Disabling a cycle

- Regenerating the QR/link

- Deleting a draft cycle, if deletion is allowed



PHASE 3 — PUBLIC EMPLOYEE STEP 1 FORM



Build the public built-in Step 1 form at:

- /evaluation/:cycleToken



The form must be mobile-first because employees will access it by scanning the QR code.



The public page must:

- Validate the cycle token server-side.

- Confirm the cycle is ACTIVE.

- Confirm the current UTC time is inside the cycle dates.

- Show the cycle title and instructions.

- Show the five required employee-information fields.

- Show Factors A–J.

- Show the 1–5 rating scale.

- Require exactly one rating per factor.

- Prevent submission when required data is missing.

- Show success and error states.

- Prevent double submission.

- Show a clear submission confirmation after success.



Employee-information fields:

- Employee Number

- Full Name

- Job Title

- Division/Department

- Section/Unit



Factor-rating rules:

- Display each factor as one row.

- Display rating columns 1, 2, 3, 4, and 5.

- Use mutually exclusive radio buttons.

- Require one rating for every factor.

- Validate all ratings as integers from 1 through 5.

- Save ratings using evaluator type EMPLOYEE.



First-time submission:

- Search by Employee Number and Full Name.

- If no matching employee exists, create the employee record and current annual evaluation in one transaction.

- Do not create Pending Employee status.

- Do not create an employee account.



Returning submission:

- Match the existing Employee Number and Full Name.

- Reuse the existing employee record.

- Create the current annual evaluation if it does not already exist.

- Do not create duplicate employee records.



Duplicate protection:

- One employee may submit Step 1 only once per annual cycle.

- Enforce this through database uniqueness, server-side checks, transactions, idempotent operations, and double-submit prevention.

- Handle refreshes, retries, multiple tabs, and network failures safely.

- Keep the same QR code/link available for other employees.



After successful submission:

- Save the employee information snapshot.

- Save all ten employee ratings.

- Lock employee Step 1 responses.

- Change status to EMPLOYEE_SUBMITTED.

- Create audit-log records.

- Show only a simple confirmation.

- Do not expose confidential workflow information.



The public page must never expose:

- Employee directories

- Employee lists

- Other employee submissions

- Supervisor ratings

- President ratings

- Step 2

- Step 3

- Audit logs

- Internal routes

- Administrative data



PHASE 4 — SUPERVISOR REVIEW AND SUBMISSION TO PRESIDENT



Build the Supervisor dashboard and workflow.



IMPORTANT ACCESS RULE:



Every authorized Supervisor receives all completed employee Step 1 assessments. There is no employee assignment restriction.



Do not filter or restrict Supervisor access by:

- Assigned employee

- Department

- Division

- Section

- Unit

- Position

- Employee mapping



Build:

- Supervisor dashboard

- All submitted employee assessments queue

- Search

- Filtering

- Sorting

- Pagination

- Status filters

- Employee Step 1 detail view

- Read-only employee information

- Read-only employee/ratee ratings

- Supervisor rating matrix

- Supervisor remarks field, if included

- Save Draft

- Submit to President

- Status tracking

- Evaluation audit-history view according to permissions



The Supervisor rating section must use the same Factors A–J:

- Quality of Work

- Quantity of Work

- Job Knowledge

- Ability to Learn

- Dependability

- Initiative

- Human Relations/Teamwork

- Cost Consciousness

- Discipline

- Safety Consciousness/Care of Equipment



The Supervisor must select exactly one rating from 1 through 5 for every factor using mutually exclusive radio buttons.



Supervisor permissions:

- View all employee Step 1 assessments after employee submission.

- View employee information and employee ratings as read-only.

- Enter Supervisor ratings.

- Save a Supervisor draft.

- Edit their own Supervisor draft before submission.

- Submit the completed assessment to the President.



Supervisor restrictions:

- Cannot edit Employee Step 1 information.

- Cannot edit Employee ratings.

- Cannot edit another evaluator’s ratings.

- Cannot edit President ratings.

- Cannot complete President Step 2.

- Cannot complete President Step 3.

- Cannot finalize an evaluation.

- Cannot manage users, roles, or permissions unless separately authorized.

- Cannot access unrelated confidential administrative information.



Supervisor submission requirements:

- All ten Supervisor ratings must be completed.

- Validate each rating as an integer from 1 through 5.

- Save ratings using evaluator type SUPERVISOR.

- Lock Supervisor ratings after submission.

- Change status to SUPERVISOR_SUBMITTED or PRESIDENT_REVIEW.

- Make the evaluation visible in the President queue.

- Record the submission in the audit log.



If a Supervisor needs to change a submitted rating:

- Do not allow silent editing.

- Require a controlled correction/reopen action.

- Require authorized permission.

- Require a reason.

- Preserve previous and new values.

- Use optimistic concurrency.

- Create an audit record.

- Do not delete the original history.



PHASE 4 — PRESIDENT QUEUE AND STEP 2/3 PREPARATION



Build the President dashboard and President evaluation queue.



The President queue must display evaluations with status:

- SUPERVISOR_SUBMITTED

- PRESIDENT_REVIEW



Show:

- Employee Number

- Full Name

- Job Title snapshot

- Division/Department snapshot

- Section/Unit snapshot

- Evaluation cycle/year

- Employee submission date

- Supervisor submission date

- Current status



Allow the President to:

- View the submitted employee Step 1 ratings as read-only.

- View the submitted Supervisor ratings as read-only.

- Open the complete evaluation record.

- See the prepared areas for Step 2 and Step 3.



For this phase, create the President workflow preparation only:

- Prepare the President evaluation route.

- Prepare the President queue.

- Prepare the required data relationships.

- Display a clear placeholder indicating that Step 2 and Step 3 will be implemented next.

- Do not allow President Step 2 or Step 3 submission yet.

- Do not calculate final scores yet.

- Do not finalize evaluations yet.

- Do not generate PDFs yet.

- Do not build AI recommendations yet.



PHASE 1–4 ENTERPRISE RELIABILITY AND SECURITY



Use:

- Normalized relational data

- Strong TypeScript typing

- Server-side authorization

- RLS

- RBAC

- Zod validation

- Parameterized database operations

- Least-privilege access

- Secure sessions

- UTC timestamps

- Database transactions

- Idempotent mutations

- Optimistic concurrency

- Retry-safe operations

- Safe error responses

- TanStack Query cache invalidation

- Error boundaries

- No secrets in frontend code

- No duplicated business logic between frontend and backend



Implement structured, append-only audit logging for:

- Login

- Failed login

- Logout

- Password reset

- User creation and update

- Account activation/deactivation

- Account locking/unlocking

- Role changes

- Permission changes

- Session revocation

- Cycle creation/update

- Cycle activation

- Cycle closure

- Cycle disabling

- QR/link generation

- QR/link regeneration

- Employee record creation

- Employee record matching

- Employee Step 1 

Employee Step 1 submission

- Duplicate submission attempt

- Supervisor draft save

- Supervisor rating changes

- Supervisor submission to President

- Unauthorized access attempts

- Sensitive backend operations



Audit events must include:

- UTC timestamp

- Actor user ID when available

- Actor role

- Action

- Module

- Entity type

- Entity ID

- Employee ID when relevant

- Evaluation ID when relevant

- Previous-value summary when relevant

- New-value summary when relevant

- Reason when required

- Request/correlation ID

- Result

- IP address and user-agent when safely available



Never store passwords, raw tokens, reset tokens, private keys, or secrets in audit logs.



QUALITY AND ACCEPTANCE TESTS



After implementation:



1. Run TypeScript validation.

2. Run the production build.

3. Fix all errors affecting functionality.

4. Test login, logout, forgot password, and password reset.

5. Test protected routes for all four internal roles.

6. Test RBAC and RLS allow/deny behavior.

7. Test last-Administrator protection.

8. Test HR cycle creation, activation, closing, disabling, and QR/link generation.

9. Test invalid, expired, closed, and disabled QR links.

10. Test public Step 1 required fields.

11. Test Factors A–J.

12. Test one required radio-button rating from 1–5 for every factor.

13. Test invalid and incomplete employee submissions.

14. Test first-time employee record creation.

15. Test returning employee matching.

16. Test duplicate employee-number prevention.

17. Test one-submission-per-employee-per-cycle enforcement.

18. Test the shared QR/link with multiple employees.

19. Test that every authorized Supervisor can view all submitted Step 1 assessments.

20. Test that no Supervisor assignment restriction exists.

21. Test Supervisor rating completion.

22. Test Supervisor submission to the President.

23. Test that employee ratings cannot be edited by Supervisors.

24. Test that Supervisor ratings become locked after submission.

25. Test President queue visibility.

26. Test that President Step 2 and Step 3 are not yet submittable.

27. Test audit-log creation for all sensitive actions.

28. Test direct unauthorized API/database access through RLS.

29. Confirm no employee account is created.

30. Confirm no Google, Firebase, or external-form dependency exists.

31. Confirm no secret key is exposed in frontend code.



Do not build Phase 5 or later.



At the end, provide a concise report containing:

- Features completed

- Routes added

- Backend functionality added

- Roles and permissions implemented

- RLS and security controls implemented

- Audit events implemented

- Tests completed

- Known limitations

## Production

This application is branded and deployed for Priority Handling Logistics, Inc.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
