const express = require("express");
const router = express.Router();

const db = require("../database/db");
const verifyToken = require("../verifytoken");
const PDFDocument = require("pdfkit");



function parseQuillDelta(strOrDelta) {
  if (!strOrDelta) return [];
  if (typeof strOrDelta !== "string") return [{ insert: String(strOrDelta) }];

  const trimmed = strOrDelta.trim();
  if (!trimmed.startsWith("[")) {
    return [{ insert: trimmed }];
  }

  try {
    const ops = JSON.parse(trimmed);
    return Array.isArray(ops) ? ops : [{ insert: trimmed }];
  } catch (e) {
    return [{ insert: trimmed }];
  }
}

function quillToPlainText(strOrDelta) {
  const ops = parseQuillDelta(strOrDelta);
  return ops
    .map((op) => (typeof op.insert === "string" ? op.insert : ""))
    .join("")
    .replace(/\n+$/, "");
}

function renderRichText(doc, strOrDelta, x, contentWidth, opts = {}) {
  const {
    defaultColor = "#444444",
    linkColor = "#0066cc",
    fontSize = 10,
    lineGap = 4,
  } = opts;

  const ops = parseQuillDelta(strOrDelta);
  if (ops.length === 0) return;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const expandedOps = [];

  ops.forEach((op) => {
    if (typeof op.insert !== "string") return;
    const parts = op.insert.split(urlRegex);
    parts.forEach((part) => {
      if (!part) return;
      if (urlRegex.test(part)) {
        expandedOps.push({
          insert: part,
          attributes: { ...(op.attributes || {}), link: part },
        });
      } else {
        expandedOps.push({ insert: part, attributes: op.attributes || {} });
      }
      urlRegex.lastIndex = 0;
    });
  });

  const lines = [];
  let currentLine = [];
  let listCounters = {};

  expandedOps.forEach((op) => {
    const text = op.insert;
    const parts = text.split("\n");

    parts.forEach((part, idx) => {
      if (idx > 0) {
        lines.push({ segments: currentLine, blockAttrs: op.attributes || {} });
        currentLine = [];
      }
      if (part.length > 0) {
        currentLine.push({ text: part, attrs: op.attributes || {} });
      }
    });
  });

  if (currentLine.length > 0) {
    lines.push({ segments: currentLine, blockAttrs: {} });
  }

  if (lines.length === 0) return;

  lines.forEach((line) => {
    if (line.segments.length === 0) {
      doc.moveDown(0.4);
      return;
    }

    doc.x = x;
    const isBullet = line.blockAttrs?.list === "bullet";
    const isOrdered = line.blockAttrs?.list === "ordered";

    let textX = x;

    if (isBullet) {
      doc
        .circle(x + 4, doc.y + fontSize / 2 + 1, 2)
        .fillColor(defaultColor)
        .fill();
      textX = x + 14;
    } else if (isOrdered) {
      const key = "ordered";
      listCounters[key] = (listCounters[key] || 0) + 1;
      doc
        .font("Helvetica")
        .fontSize(fontSize)
        .fillColor(defaultColor)
        .text(`${listCounters[key]}.`, x, doc.y, {
          continued: true,
          width: 14,
        });
      textX = x + 14;
    } else {
      listCounters = {};
    }

    const effectiveWidth = contentWidth - (textX - x);

    line.segments.forEach((seg, segIdx) => {
      const isLast = segIdx === line.segments.length - 1;
      const attrs = seg.attrs || {};

      const isBold = attrs.bold === true;
      const isItalic = attrs.italic === true;

      let fontName = "Helvetica";
      if (isBold && isItalic) fontName = "Helvetica-BoldOblique";
      else if (isBold) fontName = "Helvetica-Bold";
      else if (isItalic) fontName = "Helvetica-Oblique";

      doc.font(fontName).fontSize(fontSize);

      const color = attrs.link ? linkColor : defaultColor;
      doc.fillColor(color);

      const textOpts = {
        continued: !isLast,
        lineGap,
        width: effectiveWidth,
      };

      if (attrs.link) {
        textOpts.link = attrs.link;
        textOpts.underline = true;
      }
      if (attrs.underline && !attrs.link) {
        textOpts.underline = true;
      }

      doc.text(seg.text, segIdx === 0 ? textX : undefined, undefined, textOpts);
    });
  });
}


router.get("/my-cv", verifyToken, async (req, res) => {
  try {
    console.log("[CV] GET /my-cv hit. user:", req.user);

    const userId = req.user.id;
    const sql = "SELECT * FROM cvs WHERE user_id = ? LIMIT 1";

    console.log("[CV] GET SQL:", sql, "PARAMS:", [userId]);

    const [results] = await db.query(sql, [userId]);

    console.log("[CV] GET rows:", results?.length || 0);

    if (!results || results.length === 0) {
      return res.json(null);
    }

    return res.json(results[0]);
  } catch (err) {
    console.error("[CV] Error fetching CV:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

router.post("/my-cv", verifyToken, async (req, res) => {
  try {
    console.log("[CV] POST /my-cv hit. user:", req.user);

    const userId = req.user.id;

    const {
      title,
      full_name,
      email,
      phone,
      summary,
      education,
      experience,
      skills,
      template_type,
      projects,
      achievements,
      training,
      certifications,
      contact_links,
    } = req.body;

    console.log("[CV] POST body received");
    console.log("[CV] title:", title);
    console.log("[CV] full_name:", full_name);
    console.log("[CV] template_type:", template_type);
    console.log("[CV] summary length:", summary?.length || 0);
    console.log("[CV] education length:", education?.length || 0);
    console.log("[CV] experience length:", experience?.length || 0);
    console.log("[CV] skills length:", skills?.length || 0);
    console.log("[CV] projects length:", projects?.length || 0);
    console.log("[CV] achievements length:", achievements?.length || 0);
    console.log("[CV] training length:", training?.length || 0);
    console.log("[CV] certifications length:", certifications?.length || 0);
    console.log("[CV] contact_links length:", contact_links?.length || 0);

    const checkSql = "SELECT id FROM cvs WHERE user_id = ? LIMIT 1";
    console.log("[CV] CHECK SQL:", checkSql, "PARAMS:", [userId]);

    const [results] = await db.query(checkSql, [userId]);

    console.log("[CV] CHECK query completed");

    if (!results || results.length === 0) {
      console.log("[CV] No existing CV found. INSERT path.");

      const insertSql = `
        INSERT INTO cvs (
          user_id, title, full_name, email, phone,
          summary, education, experience, skills, template_type,
          projects, achievements, training, certifications, contact_links
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `;

      const insertParams = [
        userId,
        title,
        full_name,
        email,
        phone,
        summary,
        education,
        experience,
        skills,
        template_type || "template1",
        projects,
        achievements,
        training,
        certifications,
        contact_links,
      ];

      console.log("[CV] INSERT params prepared");

      const [insertResult] = await db.query(insertSql, insertParams);

      console.log("[CV] INSERT query completed", insertResult);

      return res.status(201).json({ message: "CV created" });
    } else {
      console.log("[CV] Existing CV found. UPDATE path.");

      const cvId = results[0].id;

      const updateSql = `
        UPDATE cvs
        SET title=?, full_name=?, email=?, phone=?,
            summary=?, education=?, experience=?, skills=?, template_type=?,
            projects=?, achievements=?, training=?, certifications=?, contact_links=?
        WHERE id=? AND user_id=?
      `;

      const updateParams = [
        title,
        full_name,
        email,
        phone,
        summary,
        education,
        experience,
        skills,
        template_type || "template1",
        projects,
        achievements,
        training,
        certifications,
        contact_links,
        cvId,
        userId,
      ];

      console.log("[CV] UPDATE params prepared. cvId:", cvId);

      const [updateResult] = await db.query(updateSql, updateParams);

      console.log("[CV] UPDATE query completed", updateResult);

      return res.json({ message: "CV updated" });
    }
  } catch (err) {
    console.error("[CV] Error saving CV:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
      code: err.code || null,
    });
  }
});

router.get("/my-cv/pdf", verifyToken, async (req, res) => {
  try {
    console.log("[CV] GET /my-cv/pdf hit. user:", req.user);

    const userId = req.user.id;
    
    
    const [userResult] = await db.query("SELECT cv_download_count, is_premium FROM users WHERE id = ?", [userId]);
    if (userResult && userResult.length > 0) {
      const u = userResult[0];
      if (!u.is_premium) {
        if (u.cv_download_count >= 3) {
            console.log("[CV] User reached download limit", userId);
            return res.status(403).json({ message: "Download limit reached. Upgrade to Premium.", code: "PAYMENT_REQUIRED" });
        }
        
        await db.query("UPDATE users SET cv_download_count = cv_download_count + 1 WHERE id = ?", [userId]);
      }
    }
    

    const sql = "SELECT * FROM cvs WHERE user_id = ? LIMIT 1";

    console.log("[CV] PDF SQL:", sql, "PARAMS:", [userId]);

    const [results] = await db.query(sql, [userId]);

    console.log("[CV] PDF SELECT query completed");

    if (!results || results.length === 0) {
      console.log("[CV] No CV found for PDF");
      return res.status(404).json({ message: "No CV found" });
    }

    const cv = results[0];
    const templateType = cv.template_type || "template1";

    console.log("[CV] Starting PDF generation for template:", templateType);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=cv_${templateType}.pdf`
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    switch (templateType) {
      case "template1":
        buildTemplate1(doc, cv);
        break;
      case "template2":
        buildTemplate2(doc, cv);
        break;
      case "template3":
        buildTemplate3(doc, cv);
        break;
      case "template4":
      default:
        buildTemplate4(doc, cv);
        break;
    }

    doc.end();
    console.log("[CV] PDF generated successfully");
  } catch (err) {
    console.error("[CV] PDF error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

module.exports = router;


// TEMPLATE 1

function buildTemplate1(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - margin * 2;

  const fullName = cv.full_name || "YOUR NAME";
  const [firstName, ...lastParts] = fullName.split(" ");
  const lastName = lastParts.join(" ");

  doc.rect(margin, margin, contentWidth, 4).fill("#111111");

  doc
    .fontSize(18)
    .fillColor("#444444")
    .text(firstName.toUpperCase(), margin, margin + 16, {
      width: contentWidth,
      align: "center",
    });

  doc
    .fontSize(26)
    .fillColor("#000000")
    .text(lastName.toUpperCase(), { width: contentWidth, align: "center" });

  const yAfterName = doc.y + 8;

  doc
    .moveTo(margin, yAfterName)
    .lineTo(pageWidth - margin, yAfterName)
    .stroke("#000000");

  const leftWidth = contentWidth * 0.32;
  const gap = 25;
  const leftX = margin;
  let leftY = yAfterName + 16;
  const rightX = leftX + leftWidth + gap;
  let rightY = leftY;
  const rightWidth = contentWidth - leftWidth - gap;

  doc
    .moveTo(leftX + leftWidth + gap / 2, yAfterName + 5)
    .lineTo(leftX + leftWidth + gap / 2, pageHeight - margin)
    .stroke("#d0d0d0");

  const leftSectionTitle = (label, y) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000000")
      .text(label, leftX, y, { width: leftWidth });
    return doc.y + 4;
  };

  leftY = leftSectionTitle("CONTACT", leftY);
  doc.font("Helvetica").fontSize(9).fillColor("#555555");
  if (cv.phone) {
    doc.text(cv.phone, leftX, leftY, { width: leftWidth, lineGap: 2 });
    leftY = doc.y + 2;
  }
  if (cv.email) {
    doc.text(cv.email, leftX, leftY, { width: leftWidth, lineGap: 2 });
    leftY = doc.y + 2;
  }
  if (cv.contact_links) {
    doc.text(cv.contact_links, leftX, leftY, { width: leftWidth, lineGap: 2 });
    leftY = doc.y + 12;
  }

  leftY = leftSectionTitle("EDUCATION", leftY);
  renderRichText(doc, cv.education, leftX, leftWidth, {
    defaultColor: "#555555",
    fontSize: 9,
    lineGap: 2,
  });
  leftY = doc.y + 10;

  doc
    .moveTo(leftX, leftY)
    .lineTo(leftX + leftWidth, leftY)
    .stroke("#000000");
  leftY += 10;

  leftY = leftSectionTitle("SKILLS", leftY);
  renderRichText(doc, cv.skills, leftX, leftWidth, {
    defaultColor: "#555555",
    fontSize: 9,
    lineGap: 2,
  });

  const rightSectionTitle = (label, y) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#000000")
      .text(label, rightX, y, { width: rightWidth });
    return doc.y + 6;
  };

  rightY = rightSectionTitle("PROFILE", rightY);
  renderRichText(doc, cv.summary, rightX, rightWidth, {
    defaultColor: "#555555",
    fontSize: 10,
    lineGap: 3,
  });
  rightY = doc.y + 14;

  rightY = rightSectionTitle("WORK EXPERIENCE", rightY);
  renderRichText(doc, cv.experience, rightX, rightWidth, {
    defaultColor: "#555555",
    fontSize: 10,
    lineGap: 3,
  });
  rightY = doc.y + 14;

  rightY = rightSectionTitle("PROJECTS", rightY);
  renderRichText(doc, cv.projects, rightX, rightWidth, {
    defaultColor: "#555555",
    fontSize: 10,
    lineGap: 3,
  });
  rightY = doc.y + 14;

  rightY = rightSectionTitle("ACHIEVEMENTS", rightY);
  renderRichText(doc, cv.achievements, rightX, rightWidth, {
    defaultColor: "#555555",
    fontSize: 10,
    lineGap: 3,
  });
  rightY = doc.y + 14;

  rightSectionTitle("TRAINING & CERTIFICATIONS", rightY);
  const trainingCert = [
    cv.training ? quillToPlainText(cv.training) : null,
    cv.certifications ? quillToPlainText(cv.certifications) : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (trainingCert) {
    renderRichText(doc, trainingCert, rightX, rightWidth, {
      defaultColor: "#555555",
      fontSize: 10,
      lineGap: 3,
    });
  }
}


// TEMPLATE 2

function buildTemplate2(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - margin * 2;

  doc.rect(0, 0, pageWidth, pageHeight).fill("#f3f5ff");

  doc
    .roundedRect(
      margin - 10,
      margin - 10,
      pageWidth - (margin - 10) * 2,
      pageHeight - (margin - 10) * 2,
      12
    )
    .fill("#ffffff");

  doc.x = margin;
  doc.y = margin;

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#000000")
    .text(cv.full_name || "YOUR NAME", margin, margin, { width: contentWidth });

  doc
    .moveDown(0.3)
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#555555")
    .text(cv.title || "", { width: contentWidth });

  const contactLine = [cv.email, cv.phone, cv.contact_links]
    .filter(Boolean)
    .join("  |  ");
  if (contactLine) {
    doc
      .moveDown(0.3)
      .fontSize(9)
      .fillColor("#777777")
      .text(contactLine, { width: contentWidth });
  }

  doc.moveDown(1);

  const sections = [
    { label: "WORK EXPERIENCE", value: cv.experience },
    { label: "PROJECTS", value: cv.projects },
    { label: "SKILLS", value: cv.skills },
    { label: "EDUCATION", value: cv.education },
    { label: "INTERESTS & TRAINING", value: cv.training },
    { label: "CERTIFICATIONS", value: cv.certifications },
    { label: "AWARDS & ACHIEVEMENTS", value: cv.achievements },
  ];

  sections.forEach(({ label, value }) => {
    if (!value) return;

    const startY = doc.y + 8;

    doc.rect(margin, startY, contentWidth, 18).fill("#f0f0f0");

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#333333")
      .text(label, margin + 8, startY + 4, { width: contentWidth - 16 });

    doc.x = margin;
    doc.y = startY + 26;

    doc.font("Helvetica").fontSize(10);
    renderRichText(doc, value, margin, contentWidth, {
      defaultColor: "#444444",
      fontSize: 10,
      lineGap: 3,
    });

    doc.moveDown(0.5);
  });
}


// TEMPLATE 3

function buildTemplate3(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - margin * 2;

  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor("#000000")
    .text(cv.full_name || "YOUR NAME", margin, margin, {
      width: contentWidth,
      align: "center",
    });

  doc
    .moveDown(0.3)
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#555555")
    .text(cv.title || "", { width: contentWidth, align: "center" });

  const contactParts = [cv.email, cv.phone, cv.contact_links].filter(Boolean);
  if (contactParts.length) {
    doc
      .moveDown(0.3)
      .fontSize(9)
      .fillColor("#777777")
      .text(contactParts.join("  •  "), { width: contentWidth, align: "center" });
  }

  doc.moveDown(0.8);
  doc
    .moveTo(margin, doc.y)
    .lineTo(pageWidth - margin, doc.y)
    .strokeColor("#cccccc")
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.8);

  const sections = [
    { label: "PROFILE", value: cv.summary },
    { label: "EXPERIENCE", value: cv.experience },
    { label: "EDUCATION", value: cv.education },
    { label: "SKILLS", value: cv.skills },
    { label: "PROJECTS", value: cv.projects },
    { label: "ACHIEVEMENTS", value: cv.achievements },
    { label: "TRAINING", value: cv.training },
    { label: "CERTIFICATIONS", value: cv.certifications },
  ];

  sections.forEach(({ label, value }) => {
    if (!value) return;

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#000000")
      .text(label, margin, doc.y, {
        width: contentWidth,
        characterSpacing: 1.2,
      });

    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10);

    renderRichText(doc, value, margin, contentWidth, {
      defaultColor: "#444444",
      fontSize: 10,
      lineGap: 4,
    });

    doc.moveDown(0.8);
  });
}


// TEMPLATE 4

function buildTemplate4(doc, cv) {
  const margin = 40;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - margin * 2;
  const primaryColor = "#8E5EA2";
  const textColor = "#333333";

  doc
    .moveDown(1)
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(primaryColor)
    .text((cv.full_name || "YOUR NAME").toUpperCase(), margin, doc.y, {
      align: "center",
      width: contentWidth,
    });

  const contactParts = [cv.contact_links, cv.phone, cv.email].filter(Boolean);
  doc
    .moveDown(0.5)
    .font("Helvetica")
    .fontSize(10)
    .fillColor(textColor)
    .text(contactParts.join(" • "), { align: "center", width: contentWidth });

  doc.moveDown(1.5);

  const addSection = (title, value) => {
    if (!value) return;

    doc
      .moveTo(margin, doc.y)
      .lineTo(pageWidth - margin, doc.y)
      .strokeColor("#cbbbd8")
      .lineWidth(1)
      .stroke();

    doc.moveDown(0.8);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(primaryColor)
      .text(title.toUpperCase(), margin, doc.y, { align: "left" });

    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10);

    renderRichText(doc, value, margin, contentWidth, {
      defaultColor: textColor,
      linkColor: primaryColor,
      fontSize: 10,
      lineGap: 4,
    });

    doc.moveDown(1);
  };

  addSection("Summary", cv.summary);
  addSection("Work Experience", cv.experience);
  addSection("Education", cv.education);

  const extras = [
    { label: "Technical Skills", value: cv.skills },
    { label: "Training", value: cv.training },
    { label: "Certifications", value: cv.certifications },
    { label: "Awards/Activities", value: cv.achievements },
    { label: "Projects", value: cv.projects },
  ].filter((i) => i.value);

  if (extras.length > 0) {
    doc
      .moveTo(margin, doc.y)
      .lineTo(pageWidth - margin, doc.y)
      .strokeColor("#cbbbd8")
      .lineWidth(1)
      .stroke();

    doc.moveDown(0.8);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(primaryColor)
      .text("ADDITIONAL INFORMATION", margin, doc.y, { align: "left" });

    doc.moveDown(0.6);

    extras.forEach((item) => {
      const bulletY = doc.y + 5;
      doc.circle(margin + 5, bulletY, 1.5).fillColor(textColor).fill();

      const labelDelta = JSON.stringify([
        { insert: `${item.label}: `, attributes: { bold: true } },
        { insert: quillToPlainText(item.value) },
      ]);

      renderRichText(doc, labelDelta, margin + 14, contentWidth - 14, {
        defaultColor: textColor,
        linkColor: primaryColor,
        fontSize: 10,
        lineGap: 3,
      });

      doc.moveDown(0.3);
    });
  }
}