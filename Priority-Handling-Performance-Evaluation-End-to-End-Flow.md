<!-- Converted from Priority-Handling-Performance-Evaluation-End-to-End-Flow.docx -->

# END-TO-END PRESENTATION FLOW

Priority Handling Logistics Performance Evaluation System

This walkthrough follows the source code. It explains account setup, the A–J evaluation, the AI assistance available at different stages, the Committee’s action choices, the President’s decision, and the follow-up work.

The system includes internal employee records and Performance, Development, Training, Succession, and Social Recognition features. The code does not show a live connection that automatically reads from or writes to separate HCM, Workforce Management, or Payroll systems. I’ll call out those external handoffs separately.

## 1. Initial setup: create the first Administrator

The first Administrator uses a one-time setup page and enters their name, work email, and password. The system checks the password, then creates a login account, internal user profile, linked employee record, employee number, and Administrator role.

The setup is refused once an internal user exists. The first Administrator is therefore created through initial setup; additional internal accounts are created later through User Management.

Purpose: establish the first trusted account that manages access to the system.

## 2. Administrator creates accounts for internal users

The Administrator signs in and creates accounts for staff who need to use the system. They enter each person’s account details and assign the role or roles that match the person’s duties. Roles in the code include Administrator, HR, Supervisor, Reviewing Supervisor, Committee, and President.

When an account is created, the system:

- Creates a login account and internal user profile.

- Links the profile to an employee record and employee number.

- Assigns the selected roles.

- Generates a temporary password and requires the new user to change it.

- Attempts to email the account credentials.

- Records the account creation and whether the credential email was sent.

At first sign-in, the user enters their work email and temporary password, then a six-digit code sent to their email. The code expires after five minutes. If the account requires a password change, the user is directed to change it before continuing to their role’s home page.

Employees completing a self-assessment do not need an internal staff account. They use the evaluation cycle link.

Purpose: give every internal user an individual account and access based on their job.

## 3. Security during normal use

The source code does not show a password prompt triggered by “45.” Protected requests refresh a three-minute inactivity window. If it expires, a later protected request is rejected and the user must sign in again.

The system also re-checks the password for sensitive actions. For actions that require fresh verification, the user must verify again for each action. A successful verification is tied to the current session and action and lasts ten minutes.

| Security control | What happens | Purpose |
| --- | --- | --- |
| Account status | Inactive or locked users cannot use protected functions. Five failed password attempts within 15 minutes lock the internal account until an administrator unlocks it. | Blocks access to disabled accounts and slows password guessing. |
| Email verification | A six-digit code is emailed at sign-in and expires after five minutes. | Adds a second sign-in check. |
| Password re-check | The user enters their password before sensitive actions such as submitting, signing, approving, or managing accounts. | Confirms the user is present for important changes. |
| Inactivity expiry | Protected activity refreshes a three-minute inactivity window; an expired session requires sign-in again. | Limits use of an unattended session. |
| Rate limits | Repeated verification attempts are limited. | Slows repeated guessing attempts. |
| Role and permission checks | Server functions check the user’s permissions before protected operations. | Limits users to actions allowed for their role. |
| Audit records | Login, security, account, and evaluation actions are recorded. | Shows who acted and when. |
| Status and version checks | Stale edits, invalid stage changes, and edits to finalized evaluations are rejected. | Protects the workflow order and record accuracy. |
| Finalized record safeguards | Finalized evaluation records are protected from ordinary changes. | Preserves the approved result. |

## 4. HR prepares an evaluation cycle

HR creates an evaluation cycle, chooses the evaluation template, enters the dates and instructions, and activates the cycle. Activation creates a shared link for employees. HR can close or disable the cycle later and can regenerate the link for an active cycle if needed.

Purpose: define the evaluation period, the form employees will use, and when they can submit it.

## 5. Employee completes Step 1: A–J self-assessment

The employee opens the active cycle link and provides identifying information, including their employee number and name. The system checks that the employee matches an active employee record, that the cycle is open, and that the employee has not already submitted for that cycle.

The employee rates every one of the ten A–J factors and signs the submission. The system requires each factor to be rated exactly once.

A–J factors in the configured template:

A. Quality of Work

B. Quantity of Work

C. Job Knowledge

D. Ability to Learn

E. Dependability, including attendance and punctuality

F. Initiative

G. Human Relations / Teamwork

H. Cost Consciousness

I. Discipline

J. Safety Consciousness / Care of Equipment

The employee’s ratings are the employee-side evidence for comparison in the next stages. This submission is not an overall final decision and does not select an action such as promotion or transfer.

The code confirms that Step 1 captures A–J ratings and a signature. The strengths, weaknesses, effectiveness, development suggestions, and transfer-related fields are part of the Supervisor’s assessment in the current workflow, rather than separate employee Step 1 fields.

Purpose: capture how the employee rates their own performance before managerial assessment.

## 6. Supervisor rates the same A–J factors and completes the assessment

The Supervisor reviews the employee’s submission and rates the same A–J factors. The system retains each evaluator’s ratings separately so authorized users can compare the employee, Supervisor, and Reviewing Supervisor assessments.

The Supervisor also enters information such as:

- Strengths and weaknesses.

- Overall explanation and comments.

- What could make the employee more effective in the present job.

- Development potential and advancement outlook.

- Growth suggestions and other comments.

- Whether the employee is interested in another job or transfer.

- If relevant, the desired job or location and whether the employee is qualified.

The Supervisor can save a draft. Submitting requires the required ratings, a signature, and a password re-check. The evaluation then moves to the Reviewing Supervisor.

Purpose: record the manager’s assessment, evidence, development needs, and mobility context.

## 7. AI suggestions for the Supervisor

The Supervisor can ask the AI assistant to draft evaluation text and recommendations using the evaluation information available at that stage.

The suggestion uses the cycle, factor descriptions, employee and Supervisor ratings, and the difference between those ratings. Supervisor ratings are treated as the main current assessment; employee ratings are comparison context. The AI is instructed not to treat a rating difference by itself as proof of a competency gap or to invent incidents or personal facts.

AI output can include:

- A short explanation for a form question when applicable.

- Draft strengths and weaknesses.

- Practical suggestions for improving effectiveness in the present job.

- A development-potential option and reason.

- An advancement-outlook option and reason.

- Growth suggestions such as coaching, mentoring, guided practice, or job-specific training.

- Other comments and recommendations.

The Supervisor sees the generated text as a suggestion and can apply, edit, or dismiss it. The AI does not set the A–J ratings, make a final promotion or salary decision, or submit the evaluation for the Supervisor.

Purpose: help the Supervisor write clear, evidence-based comments while leaving the assessment and submission under human control.

## 8. Reviewing Supervisor reviews and validates the package

The Reviewing Supervisor reviews the employee and Supervisor ratings, the Supervisor’s comments, and the evaluation context. They complete their own ratings for the A–J factors and add comments and recommendations.

The Reviewing Supervisor can save a draft. Submitting requires a signature. Once submitted, the evaluation moves to Personnel processing. The scoring workflow requires complete Employee, Supervisor, and Reviewing Supervisor ratings across all factors before the score can be calculated for Personnel’s submission.

Purpose: provide a second review and complete the ratings before compensation context and Committee review.

## 9. AI suggestions for the Reviewing Supervisor

The Reviewing Supervisor can request AI draft text for the Reviewing Supervisor’s comments and recommendations.

The AI context includes:

- Employee, Supervisor, and Reviewing Supervisor ratings for each factor.

- Differences between the employee and Supervisor ratings.

- Differences between the Supervisor and Reviewing Supervisor ratings.

- The Supervisor’s remarks and assessment, including strengths, weaknesses, effectiveness, development potential, advancement outlook, growth suggestions, transfer interest, and other comments.

- The Reviewing Supervisor’s current draft and accumulated evaluation context.

The Reviewing Supervisor’s own current ratings are treated as the primary current assessment. The other ratings are comparison evidence. Differences help draw attention to factors for review, but are not treated as proof of an event or behavior.

The AI produces draft comments and recommendations. The Reviewing Supervisor can apply, edit, or dismiss each suggestion. The AI does not set ratings, determine promotion readiness, approve training, or submit the review.

Purpose: support consistent review comments and practical recommendations without replacing the Reviewing Supervisor’s judgment.

## 10. Personnel Office enters compensation context

Personnel reviews the evaluation and enters the compensation fields stored by the system:

- Present salary.

- Date of the last increase.

- Nature of the last increase.

- Amount of the last increase.

- Recommended increase or bonus.

The system calculates total points and an adjective rating using the configured scoring rules. Personnel sees those calculated values as part of the evaluation package.

In the current code, Personnel enters or updates the salary fields in this workflow. I did not find a live retrieval from a separate Payroll & Benefits system. Entering salary details provides context; it does not itself approve or apply a salary change.

Personnel must sign and pass the password re-check before submitting the package to the Committee.

Purpose: give the Committee compensation context alongside the calculated evaluation result.

## 11. Competency profile and comparison analysis

The system provides an internal Competency Profile for HR to review. For each A–J factor, the profile shows:

- Employee rating.

- Immediate Supervisor rating.

- Reviewing Supervisor rating.

- A comparison analysis.

- A trend across evaluation periods.

It also summarizes strengths and possible development areas and links to the source evaluation history. Rating differences are displayed as indicators for review; the screen states that a difference does not automatically confirm a competency gap.

The profile is built from the system’s evaluation ratings and history. It is not the same as a separate live HCM competency database.

Purpose: help HR see performance patterns across evaluators and evaluation cycles, and identify areas that may need follow-up.

## 12. Committee reviews the package and selects a recommended action

The Committee reviews the evaluation package, including the A–J ratings, score and adjective rating, Supervisor and Reviewing Supervisor comments, competency context, and Personnel’s compensation information. The Committee records a final action recommendation, action details, and a recommendation explaining the decision.

The available actions are:

| Committee action | Meaning | Typical follow-up after President approval |
| --- | --- | --- |
| Retain | Recommend that the employee stay in the present job. | Keep the approved decision in the evaluation record; no job or payroll change is implied. |
| Transfer | Recommend moving the employee to another job, unit, department, or location. | HR / Internal Mobility reviews and processes the move. |
| Promote | Recommend moving the employee to a higher position or role. | HR / HCM reviews the new position, grade, profile, and salary impact. |
| Increase Salary | Recommend a salary increase. | Payroll & Benefits reviews the approved amount and effective date before processing. |
| Training Required / Other | Recommend a different action, such as training. Details should explain what is needed. | Learning & Development reviews the requirement and arranges the actual training assignment. |

The Committee’s selection is a recommendation. It does not itself change payroll, a job assignment, or the employee’s training status. The Committee signs and submits the recommendation to the President.

Purpose: identify the proposed action, document the reason, and send it to the final approving authority.

## 13. Personalized AI training recommendation for the Committee

When the Committee selects Training Required, the screen offers a “Personalized Training Recommendation” action. The Committee can request a recommendation based on the actual evaluation evidence.

The AI receives:

- Employee, Supervisor, and Reviewing Supervisor ratings for A–J factors.

- Factor titles and descriptions.

- Supervisor comments such as strengths, weaknesses, effectiveness, development potential, growth suggestions, and other comments.

- The Committee’s current action details and recommendation.

The AI can return:

- Recommended training, if the evidence supports a practical need.

- Related competency, selected from an existing A–J factor title.

- Rationale for the recommendation.

- Suggested training focus.

- Additional details.

If the evidence does not support a training recommendation, the AI may leave that field empty. The AI is instructed not to invent courses, providers, certifications, employee facts, or competency gaps. It must not select the Committee’s final action, approve or schedule training, enroll the employee, assign a provider, or change any rating.

The Committee can use the suggestion in its action details and recommendation fields or discard it. The system records whether the suggestion was accepted or dismissed. Using the suggestion fills the Committee fields; it is still the Committee member who decides what to submit.

If the configured AI provider is unavailable, the system reports that the suggestion is unavailable and allows the Committee to complete the fields manually. The interface also labels development-mock output as mock output, not real AI analysis.

Purpose: help the Committee describe a training need clearly. It is advisory and does not create the full training assignment.

## 14. President completes the review and makes the approval decision

The President reviews the evaluation result and Committee recommendation, along with the available ratings, comments, compensation context, and promotion, transfer, or training details.

The President completes Step 2 and Step 3. Step 3 cannot be submitted until Step 2 has been submitted. Step 3 includes the reviewing supervisor or division head’s comments, final action recommendation, action details, adjective rating, and recommended increase fields as configured by the template. After President Step 3 is submitted, the system calculates and saves the score.

The President then chooses to approve or return the evaluation:

- Approve: requires a President signature and password re-check.

- Return for correction: requires a reason and a selection of which stage must correct the package.

A return sends the evaluation back to the selected correction stage. It does not itself reject the employee or select a replacement action. After correction and resubmission, the package can return to the President.

When approved, the evaluation is marked Finalized. The system records the decision, approving user, and time, then queues downstream work.

Purpose: make the official approval decision. This is the approval boundary: Committee recommendations are not operational changes until they are approved.

## 15. AI assistance in the President review

The President’s review screen also supports AI-generated draft text for mapped review fields and a broader evaluation analysis.

For a specific field, the AI suggestion is based on the relevant evaluation evidence, such as selected A–J ratings, Supervisor remarks, existing assessment fields, score, and rating label. The President sees the suggestion as draft text and must explicitly choose to use it. The code documents that the suggestion is not written into the answer or submitted automatically.

The broader AI analysis can produce:

- Performance summary.

- Strengths.

- Areas for improvement.

- Development recommendations.

- Training recommendations.

- Coaching suggestions.

It uses the employee profile snapshot, evaluation ratings, score, Supervisor remarks, and cycle details. The analysis is saved as AI analysis, but starts as not approved. The code instructs the AI not to make decisions, change ratings, or finalize the evaluation.

Purpose: help the President review and summarize the evidence. The President remains responsible for the actual decision and approval.

## 16. Results after President approval

Finalization queues background work for Development, Training, Succession, Social Recognition, the official document, and employee notification. The background work may finish after the President’s approval screen has completed.

| Downstream module | Evidence used | Result in the current system |
| --- | --- | --- |
| Learning / Development | Supervisor growth suggestions, effectiveness comments, and other comments. The system looks for actionable development recommendations. | Creates Recommended development records for Learning or HR users to review. |
| Training recommendations | Training recommendations from saved AI analysis, when present. | Creates training recommendation records for Training Management to review. |
| Training Required action | Committee action details and recommendation, when the final action is Training Required. | Creates a training record with status Required and notifies users with training-management access. |
| Succession | Development potential, advancement outlook, transfer interest, desired job or location, and qualification. | Creates or updates the internal Succession profile and notifies users with succession permissions. |
| Competency profile | Employee, Supervisor, and Reviewing Supervisor ratings, calculated result, and prior finalized evaluations. | Shows per-factor comparisons, analysis, and trends for HR. |
| Social Recognition | Finalized evaluation scores and related evaluation records. | Supports score ranking, recognition candidate review, recognition records, and certificates. |
| Final evaluation document | Finalized evaluation details and signatures. | Creates the official evaluation document and protects the finalized evaluation from ordinary changes. |
| Employee notice | Finalization status. | Queues an email telling the employee the evaluation is finalized. |

AI-generated training recommendations and a Committee’s Training Required action are separate things. The AI recommendation is optional guidance. A Required training record is created when the Committee action is Training Required, the evaluation is finalized, and action details are present.

## 17. Follow-up workflow for each approved action

These are the intended operational handoffs. The source code does not show automatic writes to external Payroll or HCM systems.

### A. Retain

The system keeps the approved evaluation as the official record. The employee remains in the current job. Development records may still be created from the Supervisor’s comments.

### B. Increase Salary

1. Route the approved action and employee details to Payroll & Benefits.

2. Review present salary, prior increases, recommendation, and approved amount.

3. Confirm the effective date.

4. Update the official compensation record.

The current code records salary context and the recommended action in the evaluation system. I did not find an automatic payroll update or effective-date handoff.

### C. Promote

1. Route the approved action and employee details to HR / HCM support.

2. Review the new job title, position, and grade.

3. Review salary impact.

4. Update the official employee profile and succession information.

The internal Succession profile can capture development and advancement details. I did not find an automatic promotion update to a separate HCM system.

### D. Transfer

1. Route the approved action and destination details to HR / Succession / Internal Mobility.

2. Review assignment, department, and location.

3. Review salary and benefits impact.

4. Confirm the move with the receiving unit and update the official assignment.

The internal Succession profile can store transfer interest, desired job, location, and qualifications. I did not find automatic transfer execution or receiving-unit notification in the code.

### E. Training Required

The current system creates a Required training record from the Committee action details after finalization. The record can store a training title, provider, date, status, competency, Committee recommendation, and notes.

The recommended full operational workflow is:

1. Learning & Development reviews the Required record and any AI training recommendation.

2. HR creates the formal training assignment, including employee, title, provider, start and end dates, related competency, and source evaluation.

3. The employee attends the training.

4. The employee submits attendance evidence and a certificate or other proof.

5. HR reviews the attendance and proof against the approved requirement.

6. HR confirms completion and marks the training Completed.

The code inspected supports recommendations and training records, but I did not find the full assignment, attendance capture, certificate submission, and HR validation process connected to this requirement. Those steps should be presented as the intended end-to-end training process, not as already-implemented features.

## 18. Supporting data flows and integration status

| Data flow | Purpose | Current behavior found in the code |
| --- | --- | --- |
| Core HCM → Performance & Development | Use employee number, name, job title, department, status, employment date, and profile details to verify employees and identify evaluation records. | Internal employee records are used for verification and evaluation snapshots. No live connection to a separate HCM application was found. |
| Workforce Management → Performance & Development | Provide attendance, punctuality, work-hour, and leave information as supporting evidence. | Factor E mentions attendance and punctuality. No attendance or timesheet import was found. Ratings are entered by evaluators; attendance data does not automatically change the rating. |
| Payroll & Benefits → Performance & Development | Display salary and previous increase history for Personnel. | The Personnel stage stores present salary and last increase date, nature, and amount. I did not find live Payroll retrieval. |
| Performance & Development → Payroll & Benefits | Provide employee ID, total points, adjective rating, recommendation, approved increase, and promotion action for processing. | The evaluation system stores points, rating, compensation context, and Committee action. I did not find an external payroll update. |
| Performance & Development → Learning & Development | Turn comments, gaps, and training decisions into follow-up work. | The system can create development records, AI training recommendations, and a Required training record. Full training assignment and completion validation were not found. |
| Performance & Development → Succession / Internal Mobility | Store development readiness and transfer information. | Finalized Supervisor responses can update the internal Succession profile. The system does not automatically execute a promotion or transfer. |
| Performance & Development → Social Recognition | Help HR identify employees for recognition from completed evaluation results. | The system ranks finalized evaluations by score and supports recognition workflows. No attendance-data feed for automatic Attendance Recognition eligibility was found. |

## 19. Final result

At the end of the workflow:

- Internal staff have individual accounts and role-based access.

- The employee’s identity is checked against an active employee profile.

- The employee submits a signed A–J self-assessment.

- The Supervisor and Reviewing Supervisor submit their own A–J ratings and comments.

- AI can help draft evidence-based text for the Supervisor, Reviewing Supervisor, Committee training recommendation, and President review.

- HR can compare evaluator ratings and trends in the Competency Profile.

- Personnel enters compensation context, and the system calculates points and rating.

- The Committee recommends an action and provides its details.

- The President approves or returns the package.

- Approval finalizes and protects the evaluation and queues supporting records.

- Payroll changes, promotions, transfers, and the complete training attendance and certificate process still require operational processing by the responsible team or connected subsystem.

## Simple closing statement for the panel

“The system collects performance evidence from the employee, Supervisor, and Reviewing Supervisor across the same ten A–J factors. AI can help each authorized reviewer draft comments or, for the Committee, suggest training based on the actual evaluation evidence. HR can review competency comparisons and trends. Personnel adds compensation context, the Committee recommends an action, and the President makes it official. After approval, the system creates internal development, training, succession, recognition, and evaluation records. The AI supports staff with suggestions; it does not set ratings or approve actions. Payroll, job changes, transfers, and the full training-completion process are handled by the responsible operational teams unless and until those external connections are implemented.”
