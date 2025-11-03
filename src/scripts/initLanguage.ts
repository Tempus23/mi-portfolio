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

  // Update HTML lang attribute
  document.documentElement.lang = lang;

  // Store globally for other scripts
  window.__cvData = cvData;
  window.__translations = t;
  window.__currentLang = lang;

  // Update navigation items
  updateNavigation(t);
  
  // Update hero section
  updateHero(cvData, t);
  
  // Update section titles
  updateSectionTitles(t);
  
  // Update skills section
  updateSkills(cvData, t);
  
  // Update projects section
  updateProjects(cvData, t);
  
  // Update about me section
  updateAboutMe(cvData, t);
  
  // Update footer
  updateFooter(cvData, t);
  
  // Update experience and academic formation (they use the same data structure)
  updateExperience(cvData);
  updateAcademicFormation(cvData);
}

function updateNavigation(t: typeof translations.en) {
  const navLinks = document.querySelectorAll('header nav a');
  navLinks.forEach((link) => {
    const label = link.getAttribute('aria-label');
    if (label === 'experience') link.textContent = t.nav.experience;
    else if (label === 'projects') link.textContent = t.nav.projects;
    else if (label === 'skills') link.textContent = t.nav.skills;
    else if (label === 'about-me') link.textContent = t.nav.aboutMe;
    else if (label === 'contact') link.textContent = t.nav.contact;
  });
}

function updateHero(cvData: typeof cvDataEn, t: typeof translations.en) {
  // Update greeting
  const greeting = document.querySelector('[data-i18n="hero.greeting"]');
  if (greeting) greeting.textContent = t.hero.greeting;
  
  // Update tagline
  const tagline = document.querySelector('[data-i18n="hero.tagline"]');
  if (tagline) tagline.innerHTML = cvData.basic_info.tagline
    .replace('Artificial Intelligence', '<strong>Artificial Intelligence</strong>')
    .replace('Backend Development', '<strong>Backend Development</strong>')
    .replace('Inteligencia Artificial', '<strong>Inteligencia Artificial</strong>');
  
  // Update contact button
  const contactBtn = document.querySelector('[data-i18n="hero.contactMe"]');
  if (contactBtn) contactBtn.textContent = t.hero.contactMe;
  
  // Update language badges
  const langBadges = document.querySelectorAll('[data-lang-badge]');
  cvData.languages.forEach((lang, index) => {
    if (langBadges[index]) {
      langBadges[index].textContent = `${lang.name} · ${lang.level}`;
    }
  });
}

function updateSectionTitles(t: typeof translations.en) {
  const titles = document.querySelectorAll('[data-i18n-title]');
  titles.forEach((title) => {
    const key = title.getAttribute('data-i18n-title');
    if (key === 'workExperience') title.textContent = t.sections.workExperience;
    else if (key === 'featuredProjects') title.textContent = t.sections.featuredProjects;
    else if (key === 'techStack') title.textContent = t.sections.techStack;
    else if (key === 'academicBackground') title.textContent = t.sections.academicBackground;
    else if (key === 'aboutMe') title.textContent = t.sections.aboutMe;
  });
}

function updateSkills(cvData: typeof cvDataEn, t: typeof translations.en) {
  const techTitle = document.querySelector('[data-i18n="skills.technicalSkills"]');
  if (techTitle) techTitle.textContent = t.skills.technicalSkills;
  
  const compTitle = document.querySelector('[data-i18n="skills.professionalCompetencies"]');
  if (compTitle) compTitle.textContent = t.skills.professionalCompetencies;
  
  // Update skill items
  const techSkills = document.querySelectorAll('[data-skill-type="technical"]');
  cvData.skills.technical.forEach((skill, index) => {
    if (techSkills[index]) techSkills[index].textContent = skill;
  });
  
  const compSkills = document.querySelectorAll('[data-skill-type="competency"]');
  cvData.skills.competencies.forEach((comp, index) => {
    if (compSkills[index]) compSkills[index].textContent = comp;
  });
}

function updateProjects(cvData: typeof cvDataEn, t: typeof translations.en) {
  const projects = document.querySelectorAll('[data-project]');
  projects.forEach((projectEl, index) => {
    const project = cvData.projects[index];
    if (!project) return;
    
    const title = projectEl.querySelector('[data-project-title]');
    if (title) title.textContent = project.title;
    
    const desc = projectEl.querySelector('[data-project-description]');
    if (desc) desc.textContent = project.description;
    
    const inProgress = projectEl.querySelector('[data-project-in-progress]');
    if (inProgress && project.inProgress) {
      inProgress.textContent = t.projects.inProgress;
    }
  });
}

function updateAboutMe(cvData: typeof cvDataEn, t: typeof translations.en) {
  const paragraphs = document.querySelectorAll('[data-about-paragraph]');
  cvData.about_me.description_paragraphs.forEach((para, index) => {
    if (paragraphs[index]) {
      let formattedPara = para;
      const boldKeywords = window.__currentLang === 'es' 
        ? ['Inteligencia Artificial', 'Machine Learning', 'Deep Learning', 'agentes de IA', 'backend', 'liderazgo técnico', 'experiencia internacional']
        : ['Artificial Intelligence', 'Machine Learning', 'Deep Learning', 'AI agents', 'backend', 'technical leadership', 'international experience'];
      
      boldKeywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        formattedPara = formattedPara.replace(regex, `<strong>${keyword}</strong>`);
      });
      
      paragraphs[index].innerHTML = formattedPara;
    }
  });
  
  const keyValuesTitle = document.querySelector('[data-i18n="aboutMe.keyValues"]');
  if (keyValuesTitle) keyValuesTitle.textContent = t.aboutMe.keyValues;
  
  const attributes = document.querySelectorAll('[data-attribute]');
  cvData.about_me.attributes.forEach((attr, index) => {
    if (attributes[index]) attributes[index].textContent = attr;
  });
}

function updateFooter(cvData: typeof cvDataEn, t: typeof translations.en) {
  const rights = document.querySelector('[data-i18n="footer.rightsReserved"]');
  if (rights) rights.textContent = t.footer.rightsReserved;
  
  const aboutLink = document.querySelector('[data-i18n="footer.aboutMe"]');
  if (aboutLink) aboutLink.textContent = t.footer.aboutMe;
  
  const contactLink = document.querySelector('[data-i18n="footer.contact"]');
  if (contactLink) contactLink.textContent = t.footer.contact;
}

function updateExperience(cvData: typeof cvDataEn) {
  const experiences = document.querySelectorAll('[data-experience]');
  experiences.forEach((expEl, index) => {
    const exp = cvData.professional_experience[index];
    if (!exp) return;
    
    const title = expEl.querySelector('[data-exp-title]');
    if (title) title.textContent = exp.title;
    
    const company = expEl.querySelector('[data-exp-company]');
    if (company) company.textContent = exp.company;
    
    const date = expEl.querySelector('[data-exp-date]');
    if (date) date.textContent = exp.date;
    
    const desc = expEl.querySelector('[data-exp-description]');
    if (desc) desc.textContent = exp.description;
  });
}

function updateAcademicFormation(cvData: typeof cvDataEn) {
  const formations = document.querySelectorAll('[data-formation]');
  formations.forEach((formEl, index) => {
    const formation = cvData.academic_formation[index];
    if (!formation) return;
    
    const title = formEl.querySelector('[data-formation-title]');
    if (title) title.textContent = formation.title;
    
    const company = formEl.querySelector('[data-formation-company]');
    if (company) company.textContent = formation.company;
    
    const date = formEl.querySelector('[data-formation-date]');
    if (date) date.textContent = formation.date;
    
    const desc = formEl.querySelector('[data-formation-description]');
    if (desc) desc.textContent = formation.description;
  });
}

// Initialize on page load
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initLanguage);
  document.addEventListener('astro:page-load', initLanguage);
}
