CREATE SEQUENCE IF NOT EXISTS public.employee_id_sequence
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1;

DO $$
DECLARE
  invalid_count integer;
  maximum_sequence bigint;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM public.employees
  WHERE employee_number IS NULL
     OR employee_number !~ '^EMP-[0-9]{6,}$';

  IF invalid_count > 0 THEN
    RAISE NOTICE 'Backfilling % employee records with invalid Employee IDs using new permanent IDs.', invalid_count;
  END IF;

  SELECT MAX(substring(employee_number FROM '^EMP-([0-9]+)$')::bigint)
  INTO maximum_sequence
  FROM public.employees
  WHERE employee_number ~ '^EMP-[0-9]{6,}$';

  IF maximum_sequence IS NULL OR maximum_sequence < 1 THEN
    PERFORM setval('public.employee_id_sequence', 1, false);
  ELSE
    PERFORM setval('public.employee_id_sequence', maximum_sequence, true);
  END IF;
END $$;

WITH invalid_employees AS (
  SELECT id, nextval('public.employee_id_sequence') AS sequence_number
  FROM public.employees
  WHERE employee_number IS NULL
     OR employee_number !~ '^EMP-[0-9]{6,}$'
  ORDER BY created_at, id
)
UPDATE public.employees e
SET employee_number = format('EMP-%s', lpad(invalid_employees.sequence_number::text, 6, '0'))
FROM invalid_employees
WHERE e.id = invalid_employees.id;

CREATE OR REPLACE FUNCTION public.assign_employee_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.employee_number := format('EMP-%s', lpad(nextval('public.employee_id_sequence')::text, 6, '0'));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_employee_number_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'Employee ID cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_employee_number ON public.employees;
CREATE TRIGGER trg_assign_employee_number
BEFORE INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_number();

DROP TRIGGER IF EXISTS trg_prevent_employee_number_mutation ON public.employees;
CREATE TRIGGER trg_prevent_employee_number_mutation
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_number_mutation();

ALTER TABLE public.employees
  ALTER COLUMN employee_number SET NOT NULL;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_employee_number_format_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_employee_number_format_check
  CHECK (employee_number ~ '^EMP-[0-9]{6,}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_number
  ON public.employees(employee_number);
