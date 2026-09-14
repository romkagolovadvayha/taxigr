import { z } from 'zod';

export const operatorDetailsSchema = z.object({
  legalName: z.string().trim().max(250, 'Наименование должно быть не длиннее 250 символов'),
  status: z.string().trim().max(100),
  inn: z.string().trim().regex(/^(?:\d{10}|\d{12})?$/, 'ИНН должен содержать 12 цифр для ИП или 10 цифр для организации'),
  registrationNumber: z.string().trim().regex(/^(?:\d{13}|\d{15})?$/, 'ОГРНИП должен содержать 15 цифр, ОГРН — 13 цифр'),
  address: z.string().trim().max(1000),
  email: z.string().trim().max(254).refine(
    (value) => !value || z.email().safeParse(value).success,
    'Укажите корректный email',
  ),
  phone: z.string().trim().max(50),
  taxiRegistryNumber: z.string().trim().max(100),
});

export type OperatorDetails = z.infer<typeof operatorDetailsSchema>;
