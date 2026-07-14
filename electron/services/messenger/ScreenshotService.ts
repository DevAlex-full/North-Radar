import path from 'node:path';
import fs from 'node:fs';
import type { Page } from 'playwright';
import { getWorkanaScreenshotsDir } from '../ExecutionStorage';
import { timestampForFilename } from '../ExecutionStorage';
import type { MessengerLogger } from './MessengerLogger';

const STEP = 'screenshot';

/**
 * Salva screenshots do Playwright em `{workspace}/profiles/{profileId}/workana-screenshots/`
 * (multi-perfil-ready via getWorkanaScreenshotsDir → profilePath).
 *
 * Separado dos controllers para que o log/erro de screenshot nunca interrompa
 * o fluxo principal — falhar em tirar screenshot é um aviso, não uma falha fatal.
 */
export class ScreenshotService {
  constructor(private readonly logger: MessengerLogger) {}

  /**
   * Tira e salva um screenshot da página atual.
   * Nome: `{label}_{timestamp}.png`
   * Retorna o caminho absoluto salvo, ou null se falhar (logrando o erro).
   */
  async capture(page: Page, label: string): Promise<string | null> {
    try {
      const dir = getWorkanaScreenshotsDir();
      const filename = `${this.sanitizeLabel(label)}_${timestampForFilename()}.png`;
      const fullPath = path.join(dir, filename);

      await page.screenshot({ path: fullPath, fullPage: false });
      this.logger.info(STEP, `Screenshot salvo: ${fullPath}`);
      return fullPath;
    } catch (e) {
      // Screenshot nunca é fatal — loga como warn e continua
      this.logger.warn(STEP, `Falha ao salvar screenshot (${label}): ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Tira screenshot e também salva o HTML completo da página — útil para
   * diagnosticar quando um seletor não é encontrado (o HTML mostra o que
   * realmente estava na página).
   * Retorna o caminho do PNG (o HTML é salvo em paralelo no mesmo diretório).
   */
  async captureWithHtml(page: Page, label: string): Promise<string | null> {
    const screenshotPath = await this.capture(page, label);
    try {
      const dir = getWorkanaScreenshotsDir();
      const filename = `${this.sanitizeLabel(label)}_${timestampForFilename()}.html`;
      const fullPath = path.join(dir, filename);
      const html = await page.content();
      fs.writeFileSync(fullPath, html, 'utf-8');
      this.logger.info(STEP, `HTML salvo para diagnóstico: ${fullPath}`);
    } catch (e) {
      this.logger.warn(STEP, `Falha ao salvar HTML de diagnóstico (${label}): ${(e as Error).message}`);
    }
    return screenshotPath;
  }

  private sanitizeLabel(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'screenshot';
  }
}