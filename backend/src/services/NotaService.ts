import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import { deleteMultipleUploadedFiles } from '../utils/fileStorage';
import { sanitizeNoteHtml } from '../utils/sanitizeNoteHtml';

export class NotaService {
  async createNota(data: Prisma.NotaUncheckedCreateInput) {
    const safeData = data.tipo === 'desenho' || typeof data.conteudo !== 'string'
      ? data
      : { ...data, conteudo: sanitizeNoteHtml(data.conteudo) };
    return prisma.nota.create({ data: safeData });
  }

  async getNotas(workspaceId: string, pastaId?: string) {
    const where: Prisma.NotaWhereInput = { workspaceId };
    if (pastaId !== undefined) {
      where.pastaId = pastaId === 'null' ? null : pastaId;
    }
    return prisma.nota.findMany({ where });
  }

  async getNotaById(id: string) {
    return prisma.nota.findUnique({ where: { id } });
  }

  async updateNota(id: string, data: Prisma.NotaUncheckedUpdateInput) {
    const safeData = typeof data.conteudo === 'string' ? { ...data, conteudo: sanitizeNoteHtml(data.conteudo) } : data;
    return prisma.nota.update({ where: { id }, data: safeData });
  }

  async deleteNota(id: string) {
    const nota = await prisma.nota.findUnique({ where: { id } });
    if (nota?.conteudo) {
      deleteMultipleUploadedFiles(nota.conteudo);
    }
    return prisma.nota.delete({ where: { id } });
  }
}

export const notaService = new NotaService();
