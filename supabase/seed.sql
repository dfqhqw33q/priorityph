-- Seed employee profiles for local/admin testing.
-- This matches the current public.employees table schema.

INSERT INTO public.employees (
  employee_number,
  full_name,
  job_title,
  division,
  section,
  employment_status
)
VALUES
  ('EMP-1001', 'MARIA CLARA D. REYES', 'ADMINISTRATIVE OFFICER I', 'OPERATIONS', 'ADMINISTRATIVE SUPPORT', 'ACTIVE'),
  ('EMP-1002', 'JOSEPH P. SANTOS', 'SUPERVISING ACCOUNTANT', 'FINANCE', 'BUDGET AND REPORTING', 'ACTIVE'),
  ('EMP-1003', 'ANITA M. LIM', 'HR SPECIALIST II', 'HUMAN RESOURCES', 'RECRUITMENT AND STAFFING', 'ACTIVE'),
  ('EMP-1004', 'RODRIGO T. BAUTISTA', 'FIELD OPERATIONS SUPERVISOR', 'OPERATIONS', 'LOGISTICS', 'ACTIVE'),
  ('EMP-1005', 'ELENA R. GARCIA', 'IT SUPPORT SPECIALIST', 'INFORMATION TECHNOLOGY', 'SYSTEMS SUPPORT', 'ACTIVE')
ON CONFLICT (employee_number) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  job_title = EXCLUDED.job_title,
  division = EXCLUDED.division,
  section = EXCLUDED.section,
  employment_status = EXCLUDED.employment_status,
  updated_at = NOW();
