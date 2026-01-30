import type { Transcription, TranscriptionRow } from './types';

function generateId(): string {
	return crypto.randomUUID();
}

function transformRow(row: TranscriptionRow): Transcription {
	return {
		id: row.id,
		assemblyAiId: row.assembly_ai_id,
		userEmail: row.user_email,
		title: row.title,
		fileName: row.file_name,
		language: row.language,
		duration: row.duration,
		wordCount: row.word_count,
		preview: row.preview,
		fullText: row.full_text,
		utterances: JSON.parse(row.utterances || '[]'),
		companyNames: JSON.parse(row.company_names || '[]'),
		personNames: JSON.parse(row.person_names || '[]'),
		status: row.status as Transcription['status'],
		meetingType: row.meeting_type,
		isNew: row.is_new === 1,
		viewedAt: row.viewed_at,
		assemblyCreatedAt: row.assembly_created_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function createDb(db: D1Database) {
	return {
		transcriptions: {
			async findMany(userEmail: string): Promise<Transcription[]> {
				const result = await db
					.prepare(
						'SELECT * FROM transcriptions WHERE user_email = ? ORDER BY created_at DESC'
					)
					.bind(userEmail)
					.all<TranscriptionRow>();
				return (result.results || []).map(transformRow);
			},

			async findById(id: string): Promise<Transcription | null> {
				const row = await db
					.prepare('SELECT * FROM transcriptions WHERE id = ?')
					.bind(id)
					.first<TranscriptionRow>();
				return row ? transformRow(row) : null;
			},

			async findByAssemblyId(assemblyAiId: string): Promise<Transcription | null> {
				const row = await db
					.prepare('SELECT * FROM transcriptions WHERE assembly_ai_id = ?')
					.bind(assemblyAiId)
					.first<TranscriptionRow>();
				return row ? transformRow(row) : null;
			},

			async findPending(userEmail: string): Promise<Transcription[]> {
				const result = await db
					.prepare(
						"SELECT * FROM transcriptions WHERE user_email = ? AND status = 'processing' ORDER BY created_at DESC"
					)
					.bind(userEmail)
					.all<TranscriptionRow>();
				return (result.results || []).map(transformRow);
			},

			async create(data: {
				assemblyAiId: string;
				userEmail: string;
				fileName: string;
			}): Promise<Transcription> {
				const id = generateId();
				await db
					.prepare(
						`INSERT INTO transcriptions (id, assembly_ai_id, user_email, file_name, status)
						 VALUES (?, ?, ?, ?, 'processing')`
					)
					.bind(id, data.assemblyAiId, data.userEmail, data.fileName)
					.run();

				return {
					id,
					assemblyAiId: data.assemblyAiId,
					userEmail: data.userEmail,
					title: null,
					fileName: data.fileName,
					language: null,
					duration: null,
					wordCount: null,
					preview: null,
					fullText: null,
					utterances: [],
					companyNames: [],
					personNames: [],
					status: 'processing',
					meetingType: null,
					isNew: true,
					viewedAt: null,
					assemblyCreatedAt: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};
			},

			async updateCompleted(
				assemblyAiId: string,
				data: {
					fullText: string;
					preview: string;
					wordCount: number;
					duration: number;
					language: string;
					utterances: unknown[];
				}
			): Promise<void> {
				await db
					.prepare(
						`UPDATE transcriptions
						 SET status = 'completed',
						     full_text = ?,
						     preview = ?,
						     word_count = ?,
						     duration = ?,
						     language = ?,
						     utterances = ?,
						     updated_at = datetime('now')
						 WHERE assembly_ai_id = ?`
					)
					.bind(
						data.fullText,
						data.preview,
						data.wordCount,
						data.duration,
						data.language,
						JSON.stringify(data.utterances),
						assemblyAiId
					)
					.run();
			},

			async updateTitle(
				id: string,
				data: {
					title: string;
					companyNames?: string[];
					personNames?: string[];
					meetingType?: string;
				}
			): Promise<void> {
				await db
					.prepare(
						`UPDATE transcriptions
						 SET title = ?,
						     company_names = ?,
						     person_names = ?,
						     meeting_type = ?,
						     updated_at = datetime('now')
						 WHERE id = ?`
					)
					.bind(
						data.title,
						JSON.stringify(data.companyNames || []),
						JSON.stringify(data.personNames || []),
						data.meetingType || null,
						id
					)
					.run();
			},

			async updateError(assemblyAiId: string): Promise<void> {
				await db
					.prepare(
						`UPDATE transcriptions
						 SET status = 'error', updated_at = datetime('now')
						 WHERE assembly_ai_id = ?`
					)
					.bind(assemblyAiId)
					.run();
			},

			async markViewed(id: string): Promise<void> {
				await db
					.prepare(
						`UPDATE transcriptions
						 SET is_new = 0, viewed_at = datetime('now'), updated_at = datetime('now')
						 WHERE id = ?`
					)
					.bind(id)
					.run();
			},

			async markAllViewed(userEmail: string): Promise<void> {
				await db
					.prepare(
						`UPDATE transcriptions
						 SET is_new = 0, viewed_at = datetime('now'), updated_at = datetime('now')
						 WHERE user_email = ? AND is_new = 1`
					)
					.bind(userEmail)
					.run();
			},

			async delete(id: string): Promise<void> {
				await db.prepare('DELETE FROM transcriptions WHERE id = ?').bind(id).run();
			}
		}
	};
}

export type Database = ReturnType<typeof createDb>;
