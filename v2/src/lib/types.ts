export interface Transcription {
	id: string;
	assemblyAiId: string;
	userEmail: string;
	title: string | null;
	fileName: string | null;
	language: string | null;
	duration: number | null;
	wordCount: number | null;
	preview: string | null;
	fullText: string | null;
	utterances: Utterance[];
	companyNames: string[];
	personNames: string[];
	status: 'processing' | 'completed' | 'error';
	meetingType: string | null;
	isNew: boolean;
	viewedAt: string | null;
	assemblyCreatedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Utterance {
	speaker: string;
	text: string;
	start: number;
	end: number;
}

export interface TranscriptionRow {
	id: string;
	assembly_ai_id: string;
	user_email: string;
	title: string | null;
	file_name: string | null;
	language: string | null;
	duration: number | null;
	word_count: number | null;
	preview: string | null;
	full_text: string | null;
	utterances: string;
	company_names: string;
	person_names: string;
	status: string;
	meeting_type: string | null;
	is_new: number;
	viewed_at: string | null;
	assembly_created_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface SSEMessage {
	type: 'transcription_completed' | 'transcription_error' | 'title_generated';
	data: {
		id: string;
		[key: string]: unknown;
	};
}
