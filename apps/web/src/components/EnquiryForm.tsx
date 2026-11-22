import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { enquiryRequestSchema, ENQUIRY_LIMITS, type EnquiryEntityType } from '@catalog/contracts';
import { api, ApiError } from '../api/client';

interface Props {
  entityType: EnquiryEntityType;
  entityId: string;
  entityName: string;
}

type Field = 'name' | 'email' | 'phone' | 'message';
type FieldErrors = Partial<Record<Field, string>>;
type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'success'; enquiryId: string } | { kind: 'error'; message: string };

const FIELD_FOR_PATH: Record<string, Field> = { 'customer.name': 'name', 'customer.email': 'email', 'customer.phone': 'phone', message: 'message' };

/** Product or category enquiry. Validates with the same shared schema the Catalog Service uses. */
export function EnquiryForm({ entityType, entityId, entityName }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Acceptance criterion: the customer clicks "Enquire", then completes the subsequent form.
  const [open, setOpen] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameInput.current?.focus();
  }, [open]);

  const toFieldErrors = (issues: Array<{ field: string; message: string }>): FieldErrors => {
    const result: FieldErrors = {};
    for (const issue of issues) {
      const field = FIELD_FOR_PATH[issue.field];
      if (field && !result[field]) result[field] = issue.message;
    }
    return result;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      entity: { type: entityType, id: entityId },
      customer: { name: values.name, email: values.email, phone: values.phone },
      ...(values.message.trim() ? { message: values.message } : {}),
    };
    const parsed = enquiryRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
      return;
    }
    setErrors({});
    setStatus({ kind: 'submitting' });
    try {
      const accepted = await api.submitEnquiry(payload);
      setStatus({ kind: 'success', enquiryId: accepted.enquiryId });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const fieldErrors = toFieldErrors(error.details);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          setStatus({ kind: 'idle' });
          return;
        }
        // Nothing maps to a visible field: never fail silently.
        setStatus({ kind: 'error', message: `Your enquiry was not sent. ${error.message}` });
        return;
      }
      setStatus({ kind: 'error', message: failureMessage(error) });
    }
  };

  if (status.kind === 'success') {
    return (
      <section className="enquiry enquiry--success" aria-live="polite">
        <h2>Thank you for your enquiry</h2>
        <p>
          We have received your enquiry about <strong>{entityName}</strong>. Our sales team will be in touch using the contact details you provided.
        </p>
        <p className="muted">Reference: {status.enquiryId}</p>
      </section>
    );
  }

  const field = (name: Field, label: string, input: ReactElement) => (
    <div className="field">
      <label htmlFor={`enquiry-${name}`}>{label}</label>
      {input}
      {errors[name] && (
        <span id={`enquiry-${name}-error`} className="field-error">
          {errors[name]}
        </span>
      )}
    </div>
  );

  const common = (name: Field) => ({
    id: `enquiry-${name}`,
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `enquiry-${name}-error` : undefined,
  });

  const heading = `Enquire about ${entityType === 'PRODUCT' ? 'this product' : 'this category'}`;

  if (!open) {
    return (
      <section className="enquiry enquiry--collapsed" aria-label={heading}>
        <p>Interested? Ask our sales team about {entityType === 'PRODUCT' ? 'this product' : 'this category'}.</p>
        <button type="button" className="button" aria-expanded="false" aria-controls="enquiry-form" onClick={() => setOpen(true)}>
          Enquire
        </button>
      </section>
    );
  }

  return (
    <section className="enquiry" aria-labelledby="enquiry-heading">
      <h2 id="enquiry-heading">{heading}</h2>
      <form id="enquiry-form" onSubmit={onSubmit} noValidate>
        {field('name', 'Name', <input {...common('name')} ref={nameInput} type="text" autoComplete="name" required maxLength={ENQUIRY_LIMITS.nameMax} />)}
        {field('email', 'Email', <input {...common('email')} type="email" autoComplete="email" required maxLength={ENQUIRY_LIMITS.emailMax} />)}
        {field('phone', 'Phone', <input {...common('phone')} type="tel" autoComplete="tel" required maxLength={ENQUIRY_LIMITS.phoneMax} />)}
        {field('message', 'Message (optional)', <textarea {...common('message')} rows={4} maxLength={ENQUIRY_LIMITS.messageMax} />)}
        {status.kind === 'error' && (
          <p className="form-error" role="alert">
            {status.message}
          </p>
        )}
        <button type="submit" className="button" disabled={status.kind === 'submitting'}>
          {status.kind === 'submitting' ? 'Sending…' : 'Send enquiry'}
        </button>
      </form>
    </section>
  );
}

/**
 * A timeout or lost connection means the outcome is unknown: the enquiry may have been stored.
 * Say so instead of claiming it was not sent, to avoid misleading the customer into duplicates.
 */
function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'You have sent several enquiries in a short time. Please wait a minute and try again.';
    // 502/504 from the gateway or a lost connection: the request may have been committed.
    if (error.status === 504 || error.status === 502 || error.status === 0) {
      return 'We could not confirm whether your enquiry was received. Please wait a minute before sending it again; if you do not hear from us, resubmit it.';
    }
    return `Your enquiry was not sent. ${error.message}`;
  }
  return 'Your enquiry was not sent. Please try again.';
}
