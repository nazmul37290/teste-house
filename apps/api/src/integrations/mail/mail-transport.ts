export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
};

/** Sends one email. Implementations never log credentials or message bodies. */
export interface MailTransport {
  send(message: MailMessage): Promise<{ providerMessageId?: string }>;
}
