import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TemplateField } from '../types'
import SignerField from './SignerField'

function field(overrides: Partial<TemplateField> = {}): TemplateField {
  return {
    id: 'f1',
    label: 'Full name',
    type: 'text',
    required: true,
    x: 40,
    y: 200,
    width: 160,
    height: 24,
    page: 1,
    ...overrides,
  }
}

function renderField(
  overrides: Partial<TemplateField> = {},
  props: Partial<Parameters<typeof SignerField>[0]> = {},
) {
  const target = field(overrides)
  return render(
    <SignerField
      field={target}
      value={undefined}
      zoom={1}
      isActive={false}
      isInvalid={false}
      required={target.required}
      applicable
      pageWidthPx={500}
      locked={false}
      hasSignature={false}
      registerRef={() => {}}
      onFocus={vi.fn()}
      onChange={vi.fn()}
      onRequestSignature={vi.fn()}
      {...props}
    />,
  )
}

afterEach(cleanup)

describe('SignerField', () => {
  it('renders a real error element the input is described by when flagged', () => {
    renderField({}, { isInvalid: true })

    const input = screen.getByRole('textbox', { name: 'Full name' })
    const errorId = input.getAttribute('aria-describedby')
    expect(errorId).toBe('f1-error')
    expect(input.getAttribute('aria-invalid')).toBe('true')

    const bubble = document.getElementById('f1-error')
    expect(bubble).not.toBeNull()
    expect(bubble?.textContent).toBe('Required')
  })

  it('marks a required text field as required', () => {
    const { container } = renderField()

    expect(screen.getByRole('textbox').getAttribute('aria-required')).toBe('true')
    expect(container.querySelector('.signer-field')?.getAttribute('data-required')).toBe('true')
  })

  it('leaves an optional field unmarked and styles it as optional', () => {
    const { container } = renderField({ required: false })

    expect(screen.getByRole('textbox').hasAttribute('aria-required')).toBe(false)
    const box = container.querySelector('.signer-field')
    expect(box?.getAttribute('data-required')).toBe('false')
    expect(box?.getAttribute('data-state')).toBe('pending')
  })

  it('shows the label as a placeholder on a text field', () => {
    renderField()

    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Full name')
  })

  it('names a date field by title rather than placeholder, which date inputs ignore', () => {
    const { container } = renderField({ type: 'date', label: 'Date signed' })

    const input = container.querySelector('input[type="date"]')
    expect(input?.hasAttribute('placeholder')).toBe(false)
    expect(input?.getAttribute('title')).toBe('Date signed')
  })

  it('names the active field in a callout with its requirement', () => {
    renderField({}, { isActive: true })

    expect(screen.getByText('Full name · Required')).toBeTruthy()
  })

  it('explains a greyed-out field by its controlling checkbox', () => {
    renderField(
      { requiredWhenFieldId: 'married' },
      { applicable: false, required: false, controllerLabel: 'Married' },
    )

    const input = screen.getByRole('textbox')
    expect(input.hasAttribute('disabled')).toBe(true)
    expect(input.getAttribute('aria-describedby')).toBe('f1-hint')
    expect(document.getElementById('f1-hint')?.textContent).toBe("Applies only if 'Married' is checked")
    expect(input.getAttribute('title')).toBe("Applies only if 'Married' is checked")
  })

  it('asks a flagged grouped checkbox for one option', () => {
    renderField({ type: 'checkbox', group: 'plan', label: 'Basic' }, { isInvalid: true })

    expect(document.getElementById('f1-error')?.textContent).toBe('Choose one option')
    expect(screen.getByRole('checkbox').getAttribute('aria-required')).toBe('true')
  })

  it('tells a screen reader whether a signature is required', () => {
    renderField({ type: 'signature', label: 'Applicant' })

    expect(screen.getByRole('button', { name: 'Sign Applicant, required' })).toBeTruthy()
  })

  it('flips the callout below a field hugging the page top', () => {
    const { container } = renderField({ y: 4 }, { isActive: true })

    expect(container.querySelector('.field-callout')?.getAttribute('data-placement')).toBe('below')
  })
})
