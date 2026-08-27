DO $$
DECLARE
  v_rule_id uuid;
  v_template uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.evaluation_templates WHERE id = v_template) THEN
    RETURN;
  END IF;

  SELECT id INTO v_rule_id FROM public.scoring_rules
   WHERE template_id = v_template AND name = 'Default Performance Scoring';

  IF v_rule_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.scoring_rules WHERE template_id = v_template AND status = 'ACTIVE') THEN
      RETURN;
    END IF;
    INSERT INTO public.scoring_rules
      (name, version, template_id, status, factor_weighting, required_factor_weight_total,
       employee_weight, supervisor_weight, rounding_decimals, notes, activated_at)
    VALUES
      ('Default Performance Scoring', 1, v_template, 'ACTIVE', 'EQUAL', 100,
       0, 100, 2, 'Seeded default configuration: equal factor weighting on the approved 1-5 scale.', now())
    RETURNING id INTO v_rule_id;
  END IF;

  INSERT INTO public.scoring_rule_factor_weights (rule_id, criterion_id, weight)
  SELECT v_rule_id, c.id, 10
    FROM public.evaluation_criteria c
   WHERE c.template_id = v_template
  ON CONFLICT (rule_id, criterion_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.scoring_rule_bands WHERE rule_id = v_rule_id) THEN
    INSERT INTO public.scoring_rule_bands (rule_id, label, min_score, max_score, position) VALUES
      (v_rule_id, 'Poor', 1.00, 1.49, 1),
      (v_rule_id, 'Fair', 1.50, 2.49, 2),
      (v_rule_id, 'Satisfactory', 2.50, 3.49, 3),
      (v_rule_id, 'Very Satisfactory', 3.50, 4.49, 4),
      (v_rule_id, 'Outstanding', 4.50, 5.00, 5);
  END IF;
END $$;