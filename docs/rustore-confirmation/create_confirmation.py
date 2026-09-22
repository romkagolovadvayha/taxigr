from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from docx import Document
from docx.shared import Mm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import pypdfium2 as pdfium
from pypdf import PdfReader

OUT = Path(__file__).resolve().parent
STAMP = Path(r'C:\Users\rom_i\.codex\generated_images\01a0c64f-7f20-73a1-889d-37ee0f2a5ee7\exec-329f135a-2641-4be0-a895-964ae37eb704.png')
SUPPLIED_STAMP = OUT / 'печать2.png'
STAMP_OPACITY = 0.70
SUPPLIED_SIGNATURE = OUT / 'подпись.png'
SIGNATURE_DROP_MM = 2
DEVELOPER = 'Мещеряков Роман Сергеевич'
ACCOUNT = 'VK ID: 33610634'
DATE = '22.09.2026'
PHONE = '+79821159607'
pdfmetrics.registerFont(TTFont('Arial', r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold')

BODY = [
    'Я, индивидуальный предприниматель <b>Александров Алексей Владимирович</b>, ИНН <b>183900234674</b>, настоящим подтверждаю, что указанный ниже разработчик:',
    'является моим подрядчиком и по моему поручению осуществляет разработку, сопровождение и публикацию мобильного приложения <b>«Такси Грахово»</b> в магазине приложений RuStore.',
    'Приложение «Такси Грахово» создано для осуществления деятельности ИП Александрова Алексея Владимировича. Разработка приложения, его размещение в RuStore и публикация обновлений осуществляются с моего согласия.',
    'Настоящее подтверждение выдано для предоставления в службу поддержки RuStore в ответ на замечание модератора о связи разработчика с ИП при проверке версии <b>1.0.17 (37)</b> приложения «Такси Грахово».',
]


def make_pdf(sample=False, supplied=False, signature=False):
    if signature:
        filename = 'Расписка_RuStore_с_подписью_и_печатью.pdf'
    elif supplied:
        filename = 'Расписка_RuStore_печать_под_наклоном.pdf'
    else:
        filename = 'Расписка_RuStore_с_макетом_печати.pdf' if sample else 'Расписка_RuStore_для_подписания.pdf'
    path = OUT / filename
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle('Подтверждение полномочий разработчика — Такси Грахово')
    c.setAuthor('')
    c.setSubject('Подтверждение для подписания ИП Александровым Алексеем Владимировичем')
    width, height = A4
    left, right = 23 * mm, width - 23 * mm
    y = height - 23 * mm
    c.setFillColor(HexColor('#222222'))
    c.setFont('Arial-Bold', 11)
    c.drawRightString(right, y, 'В службу поддержки RuStore')
    c.setFont('Arial', 10)
    c.drawRightString(right, y - 15, 'support@rustore.ru')
    y -= 54
    c.setFont('Arial-Bold', 15)
    c.drawCentredString(width / 2, y, 'ПОДТВЕРЖДЕНИЕ')
    c.setFont('Arial-Bold', 12)
    c.drawCentredString(width / 2, y - 20, 'полномочий разработчика (расписка)')
    y -= 52
    style = ParagraphStyle('Body', fontName='Arial', fontSize=11.4, leading=17, textColor=HexColor('#222222'))

    def paragraph(text, gap=13):
        nonlocal y
        p = Paragraph(text, style)
        _, ph = p.wrap(right - left, 700)
        p.drawOn(c, left, y - ph)
        y -= ph + gap

    paragraph(BODY[0], 24)
    c.setLineWidth(0.6)
    c.setFont('Arial-Bold', 11.4)
    c.drawCentredString(width / 2, y + 5, DEVELOPER)
    c.line(left, y, right, y)
    c.setFont('Arial', 8.5)
    c.setFillColor(HexColor('#555555'))
    c.drawCentredString(width / 2, y - 12, 'ФИО разработчика полностью')
    y -= 36
    c.setFillColor(HexColor('#222222'))
    paragraph(BODY[1])
    paragraph(BODY[2])
    paragraph(BODY[3], 19)
    c.setFont('Arial', 10.5)
    c.drawString(left, y, 'Аккаунт разработчика в RuStore:')
    y -= 23
    c.drawString(left, y + 5, ACCOUNT)
    c.line(left, y, right, y)
    y -= 34
    c.drawString(left, y, f'Дата: {DATE}')
    y -= 30
    c.drawString(left, y, 'Индивидуальный предприниматель')
    y -= 72 if signature else 30
    c.line(left, y, left + 50 * mm, y)
    if signature:
        signature_image = ImageReader(str(SUPPLIED_SIGNATURE))
        image_width, image_height = signature_image.getSize()
        signature_width = 44 * mm
        signature_height = signature_width * image_height / image_width
        c.drawImage(signature_image, left + 3 * mm, y - 2 - SIGNATURE_DROP_MM * mm, width=signature_width, height=signature_height, mask='auto')
    c.setFont('Arial', 10.5)
    c.drawString(left + 57 * mm, y + 2, 'Александров Алексей Владимирович')
    c.setFont('Arial', 8)
    c.drawCentredString(left + 25 * mm, y - 12, 'личная подпись')
    y -= 40
    c.setFont('Arial', 10)
    c.drawString(left, y, 'Телефон для связи:')
    c.drawString(left, y - 17, PHONE)
    c.line(left, y - 22, left + 97 * mm, y - 22)

    if sample or supplied:
        size = (50 if supplied else 42) * mm
        sx = right - size
        sy = (20 if signature else 36) * mm if supplied else 18 * mm
        stamp_path = SUPPLIED_STAMP if supplied else STAMP
        c.saveState()
        c.translate(sx + size / 2, sy + size / 2)
        if supplied:
            c.rotate(-12)
            c.setFillAlpha(STAMP_OPACITY)
        c.drawImage(str(stamp_path), -size / 2, -size / 2, width=size, height=size, preserveAspectRatio=True, mask='auto')
        c.restoreState()
        if not supplied:
            c.setFont('Arial', 7)
            c.setFillColor(HexColor('#a22b2b'))
            c.drawCentredString(sx + size / 2, sy - 7, 'Макет не заверяет документ')
    else:
        c.setFont('Arial', 9)
        c.setFillColor(HexColor('#555555'))
        c.drawCentredString(right - 22 * mm, 40 * mm, 'М. П. (при наличии)')

    c.save()
    reader = PdfReader(str(path))
    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text()
    for expected in ['183900234674', '1.0.17 (37)', 'Александров Алексей Владимирович', DEVELOPER, ACCOUNT, DATE, PHONE]:
        assert expected in text, expected
    pdf = pdfium.PdfDocument(str(path))
    page = pdf[0]
    bitmap = page.render(scale=2)
    preview = 'preview-signature-and-stamp.png' if signature else ('preview-stamped.png' if supplied else ('preview-sample.png' if sample else 'preview-signing.png'))
    bitmap.to_pil().save(OUT / preview)
    bitmap.close()
    page.close()
    pdf.close()
    print(path)


def make_docx(supplied=False, signature=False):
    doc = Document()
    doc.settings.element.append(OxmlElement('w:doNotAutoCompressPictures'))
    section = doc.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.top_margin = section.bottom_margin = Mm(22)
    section.left_margin = section.right_margin = Mm(23)
    normal = doc.styles['Normal']
    normal.font.name = 'Arial'
    normal.font.size = Pt(11)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(6 if signature else 9)
    p = doc.add_paragraph('В службу поддержки RuStore\nsupport@rustore.ru')
    p.alignment = 2
    p = doc.add_paragraph()
    p.alignment = 1
    r = p.add_run('ПОДТВЕРЖДЕНИЕ\nполномочий разработчика (расписка)')
    r.bold = True
    r.font.size = Pt(14)
    for index, text in enumerate(BODY):
        doc.add_paragraph(text.replace('<b>', '').replace('</b>', ''))
        if index == 0:
            p = doc.add_paragraph()
            p.add_run(DEVELOPER).bold = True
    doc.add_paragraph(f'Аккаунт разработчика в RuStore: {ACCOUNT}')
    doc.add_paragraph(f'Дата: {DATE}')
    doc.add_paragraph('Индивидуальный предприниматель')
    if signature:
        p = doc.add_paragraph()
        signature_run = p.add_run()
        signature_run.add_picture(str(SUPPLIED_SIGNATURE), width=Mm(44))
        lowered = OxmlElement('w:position')
        lowered.set(qn('w:val'), str(-round(SIGNATURE_DROP_MM * mm * 2)))
        signature_run._r.get_or_add_rPr().append(lowered)
        p.add_run(' / Александров Алексей Владимирович')
        p.add_run('\n____________________\n          личная подпись')
    else:
        doc.add_paragraph('____________________ / Александров Алексей Владимирович\n          личная подпись')
    if supplied:
        table = doc.add_table(rows=1, cols=2)
        table.autofit = False
        table.columns[0].width = Mm(100)
        table.columns[1].width = Mm(64)
        table.cell(0, 0).text = f'Телефон для связи: {PHONE}'
        p = table.cell(0, 1).paragraphs[0]
        p.alignment = 2
        picture = p.add_run().add_picture(str(SUPPLIED_STAMP), width=Mm(50))
        picture._inline.xpath('.//a:xfrm')[0].set('rot', str(12 * 60000))
        opacity = OxmlElement('a:alphaModFix')
        opacity.set('amt', str(round(STAMP_OPACITY * 100000)))
        picture._inline.xpath('.//a:blip')[0].append(opacity)
    else:
        doc.add_paragraph(f'Телефон для связи: {PHONE}')
        p = doc.add_paragraph('М. П. (при наличии)')
        p.alignment = 2
    if signature:
        filename = 'Расписка_RuStore_с_подписью_и_печатью.docx'
    else:
        filename = 'Расписка_RuStore_печать_под_наклоном.docx' if supplied else 'Расписка_RuStore_редактируемая.docx'
    path = OUT / filename
    doc.save(path)
    saved_doc = Document(path)
    saved_text = '\n'.join(p.text for p in saved_doc.paragraphs)
    saved_text += '\n'.join(cell.text for table in saved_doc.tables for row in table.rows for cell in row.cells)
    for expected in [DEVELOPER, ACCOUNT, DATE, PHONE]:
        assert expected in saved_text, expected
    if supplied:
        assert len(saved_doc.inline_shapes) == (2 if signature else 1)


if __name__ == '__main__':
    make_pdf(supplied=True, signature=True)
    make_docx(supplied=True, signature=True)
