import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnquiryForm } from '../components/EnquiryForm';
import { mockApi } from './fixtures';

const renderForm = () => render(<EnquiryForm entityType="PRODUCT" entityId="3" entityName="Cotton Jacket" />);

async function fillValid() {
  await userEvent.type(screen.getByLabelText('Name'), 'Jane Doe');
  await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
  await userEvent.type(screen.getByLabelText('Phone'), '+91 98765 43210');
  await userEvent.type(screen.getByLabelText('Message (optional)'), 'Do you ship to Pune?');
}

describe('EnquiryForm', () => {
  it('validates required fields and formats before submitting', async () => {
    const { calls } = mockApi({});
    renderForm();
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Phone'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('submits the enquiry (no recipient) and shows the received confirmation', async () => {
    const { calls } = mockApi({ 'POST /api/catalog/enquiries': () => ({ status: 202, body: { enquiryId: 'enq-123', status: 'RECEIVED', message: 'Your enquiry has been received.' } }) });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByRole('heading', { name: 'Thank you for your enquiry' })).toBeInTheDocument();
    expect(screen.getByText(/Reference: enq-123/)).toBeInTheDocument();
    // The confirmation must not claim the email was already delivered.
    expect(document.body.textContent).not.toMatch(/email (has been|was) sent/i);
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent).toEqual({ entity: { type: 'PRODUCT', id: '3' }, customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+91 98765 43210' }, message: 'Do you ship to Pune?' });
  });

  it('shows a failure message and keeps the form when submission fails', async () => {
    mockApi({ 'POST /api/catalog/enquiries': () => ({ status: 503, body: { error: { code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unable to store data. Please retry.' } } }) });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your enquiry was not sent. The service is temporarily unable to store data.');
    expect(screen.getByLabelText('Name')).toHaveValue('Jane Doe');
  });

  it('maps server-side field errors (422) onto the form', async () => {
    mockApi({ 'POST /api/catalog/enquiries': () => ({ status: 422, body: { error: { code: 'VALIDATION_ERROR', message: 'invalid', details: [{ field: 'customer.phone', message: 'Enter a valid phone number.' }] } } }) });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument();
  });

  it.each([
    [504, 'UPSTREAM_TIMEOUT'],
    [502, 'UPSTREAM_BAD_GATEWAY'],
  ])('does not claim "not sent" when the outcome is unknown (HTTP %i) (RV4-01)', async (status, code) => {
    mockApi({ 'POST /api/catalog/enquiries': () => ({ status, body: { error: { code, message: 'Gateway failure.' } } }) });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not confirm whether your enquiry was received');
    expect(alert).not.toHaveTextContent('not sent');
  });

  it('shows the server message when a 422 has no field that maps to the form (RV4-03)', async () => {
    mockApi({ 'POST /api/catalog/enquiries': () => ({ status: 422, body: { error: { code: 'ENTITY_NOT_FOUND', message: 'The referenced product does not exist.', details: [{ field: 'entity.id', message: 'Unknown product.' }] } } }) });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your enquiry was not sent. The referenced product does not exist.');
  });

  it('explains rate limiting (429)', async () => {
    mockApi({ 'POST /api/catalog/enquiries': () => ({ status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many enquiries.' } } }) });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a minute');
  });
});
