import { getLanguage } from '@/utils/languageStore';
import cvDataEn from '@/data/cv_data.json';
import cvDataEs from '@/data/cv_data_es.json';
import translations from '@/data/translations.json';

// Make data globally accessible
declare global {
  interface Window {
    __cvData: typeof cvDataEn;
    __translations: typeof translations.en;
    __currentLang: 'en' | 'es';
  }
}

export function initLanguage() {
  const lang = getLanguage();
  const cvData = lang === 'es' ? cvDataEs : cvDataEn;
  const t = lang === 'es' ? translations.es : translations.en;

  document.documentElement.lang = lang;
  updateGlobalState(lang, cvData, t);
  updateUIComponents(cvData, t);
}

function updateGlobalState(lang: 'en' | 'es', cvData: typeof cvDataEn, t: typeof translations.en) {
  window.__currentLang = lang;
  window.__cvData = cvData;
  window.__translations = t;
}

function updateUIComponents(cvData: typeof cvDataEn, t: typeof translations.en) {
  updateNavigation(t);
  updateHero(cvData, t);
  updateSectionTitles(t);
  updateSkills(cvData, t);
  updateProjects(cvData, t);
  updateAboutMe(cvData, t);
  updateFooter(t);
  updateExperience(cvData);
  updateAcademicFormation(cvData);
}

function updateNavigation(t: typeof translations.en) {
  const navMap: Record<string, string> = {
    'experience': t.nav.experience,
    'projects': t.nav.projects,
    'skills': t.nav.skills,
    'about-me': t.nav.aboutMe,
    'contact': t.nav.contact,
  };

  document.querySelectorAll('header nav a').forEach((link) => {
    const label = link.getAttribute('aria-label');
    if (label && navMap[label]) link.textContent = navMap[label];
  });
}

function updateHero(cvData: typeof cvDataEn, t: typeof translations.en) {
  updateElementText('[data-i18n="hero.greeting"]', t.hero.greeting);
  updateElementText('[data-i18n="hero.contactMe"]', t.hero.contactMe);

  const tagline = document.querySelector('[data-i18n="hero.tagline"]');
  if (tagline) {
    tagline.innerHTML = formatTagline(cvData.basic_info.tagline);
  }

  updateLanguageBadges(cvData.languages);
}

function formatTagline(tagline: string): string {
  const keywords = ['Artificial Intelligence', 'Backend Development', 'Inteligencia Artificial'];
  let formatted = tagline;
  keywords.forEach(keyword => {
    formatted = formatted.replace(keyword, `<strong>${keyword}</strong>`);
  });
  return formatted;
}

function updateLanguageBadges(languages: { name: string; level: string }[]) {
  const langBadges = document.querySelectorAll('[data-lang-badge]');
  languages.forEach((lang, index) => {
    if (langBadges[index]) {
      langBadges[index].textContent = `${lang.name} · ${lang.level}`;
    }
  });
}

function updateSectionTitles(t: typeof translations.en) {
  const titleMap: Record<string, string> = {
    'workExperience': t.sections.workExperience,
    'featuredProjects': t.sections.featuredProjects,
    'techStack': t.sections.techStack,
    'academicBackground': t.sections.academicBackground,
    'aboutMe': t.sections.aboutMe,
  };

  document.querySelectorAll('[data-i18n-title]').forEach((title) => {
    const key = title.getAttribute('data-i18n-title');
    if (key && titleMap[key]) title.textContent = titleMap[key];
  });
}

function updateSkills(cvData: typeof cvDataEn, t: typeof translations.en) {
  updateElementText('[data-i18n="skills.technicalSkills"]', t.skills.technicalSkills);
  updateElementText('[data-i18n="skills.professionalCompetencies"]', t.skills.professionalCompetencies);

  const allTechSkills = cvData.skills.technical.flatMap(group => group.items);
  updateNodeListContent('[data-skill-type="technical"]', allTechSkills);
  updateNodeListContent('[data-skill-type="competency"]', cvData.skills.competencies);
}

function updateProjects(cvData: typeof cvDataEn, t: typeof translations.en) {
  document.querySelectorAll('[data-project]').forEach((projectEl, index) => {
    const project = cvData.projects[index];
    if (!project) return;

    updateChildElementText(projectEl, '[data-project-title]', project.title);
    updateChildElementText(projectEl, '[data-project-description]', project.description);

    if (project.inProgress) {
      updateChildElementText(projectEl, '[data-project-in-progress]', t.projects.inProgress);
    }
  });
}

function updateAboutMe(cvData: typeof cvDataEn, t: typeof translations.en) {
  updateElementText('[data-i18n="aboutMe.keyValues"]', t.aboutMe.keyValues);
  updateNodeListContent('[data-attribute]', cvData.about_me.attributes);

  const paragraphs = document.querySelectorAll('[data-about-paragraph]');
  const keywords = window.__currentLang === 'es'
    ? ['Inteligencia Artificial', 'Machine Learning', 'Deep Learning', 'agentes de IA', 'backend', 'liderazgo técnico', 'experiencia internacional']
    : ['Artificial Intelligence', 'Machine Learning', 'Deep Learning', 'AI agents', 'backend', 'technical leadership', 'international experience'];

  cvData.about_me.description_paragraphs.forEach((para, index) => {
    if (paragraphs[index]) {
      let formattedPara = para;
      keywords.forEach(keyword => {
        formattedPara = formattedPara.replace(new RegExp(keyword, 'gi'), `<strong>${keyword}</strong>`);
      });
      paragraphs[index].innerHTML = formattedPara;
    }
  });
}

function updateFooter(t: typeof translations.en) {
  updateElementText('[data-i18n="footer.rightsReserved"]', t.footer.rightsReserved);
  updateElementText('[data-i18n="footer.aboutMe"]', t.footer.aboutMe);
  updateElementText('[data-i18n="footer.contact"]', t.footer.contact);
}

function updateExperience(cvData: typeof cvDataEn) {
  document.querySelectorAll('[data-experience]').forEach((expEl, index) => {
    const exp = cvData.professional_experience[index];
    if (!exp) return;

    updateChildElementText(expEl, '[data-exp-title]', exp.title);
    updateChildElementText(expEl, '[data-exp-company]', exp.company);
    updateChildElementText(expEl, '[data-exp-date]', exp.date);
    updateChildElementText(expEl, '[data-exp-description]', exp.description);
  });
}

function updateAcademicFormation(cvData: typeof cvDataEn) {
  document.querySelectorAll('[data-formation]').forEach((formEl, index) => {
    const formation = cvData.academic_formation[index];
    if (!formation) return;

    updateChildElementText(formEl, '[data-formation-title]', formation.title);
    updateChildElementText(formEl, '[data-formation-company]', formation.company);
    updateChildElementText(formEl, '[data-formation-date]', formation.date);
    updateChildElementText(formEl, '[data-formation-description]', formation.description);
  });
}

// Helper Functions
function updateElementText(selector: string, text: string) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function updateChildElementText(parent: Element, selector: string, text: string) {
  const element = parent.querySelector(selector);
  if (element) element.textContent = text;
}

function updateNodeListContent(selector: string, contentArray: string[]) {
  const nodes = document.querySelectorAll(selector);
  contentArray.forEach((content, index) => {
    if (nodes[index]) nodes[index].textContent = content;
  });
}

// Initialize on page load
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initLanguage);
  document.addEventListener('astro:page-load', initLanguage);
}
