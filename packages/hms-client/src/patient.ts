import type { InstaHmsClient, PatientDetails } from "./instahms.ts";

export interface PatientRow {
  mrNo: string;
  fullName: string;
  phone: string | null;     // E.164 (`+9715…`) or null when not on file
  raw: PatientDetails;
}

/** Fetch + normalize a patient. Throws on HMS failure. */
export async function fetchPatient(
  client: InstaHmsClient,
  mrNo: string
): Promise<PatientRow> {
  const p = await client.getPatientByMrNo(mrNo);
  const fullName =
    (p.full_name as string) ||
    (p.patient_name as string) ||
    mrNo;
  const phone = (p.patient_phone as string) || null;
  return { mrNo, fullName, phone, raw: p };
}
