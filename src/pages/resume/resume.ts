import { IAccomplishment, IBasics, ICategory, ICitizenship, ICompany, ILanguage, IProfile, IPublication, IQuality, IResumeStore, ISchool, ISkill, ITestimonial } from "../../stores/resume-store";

import "font-awesome/css/font-awesome.css";
import "./resume.scss";

export class Resume {
  basics!: IBasics;
  profiles!: Array<IProfile>;
  companies!: Array<ICompany>;
  schools!: Array<ISchool>;
  languages!: Array<ILanguage>;
  citizenship!: Array<ICitizenship>;
  skills!: Map<string, Set<ISkill>>;
  skillByName!: Map<string, ISkill>;
  testimonials!: Array<ITestimonial>;
  accomplishments!: Array<IAccomplishment>;
  qualities!: Array<IQuality>;
  publications!: Array<IPublication>;
  showingPublications = false;
  keywords!: Array<ICategory>;

  constructor(@IResumeStore private readonly resumeStore: IResumeStore) {}

  binding() {
    this.basics = this.resumeStore.basics;
    this.languages = this.resumeStore.languages;
    this.profiles = this.resumeStore.profiles;
    this.citizenship = this.resumeStore.citizenship;
    this.companies = this.resumeStore.companies.sort((a, b) => {
      return this.evaluateDateTime(a.endDate, b.endDate, -1);
    });
    this.schools = this.resumeStore.schools.sort((a, b) => {
      return this.evaluateDateTime(a.startDate, b.startDate, -1);
    });
    this.testimonials = this.resumeStore.testimonials;
    this.accomplishments = this.resumeStore.accomplishments;
    this.qualities = this.resumeStore.qualities;
    this.publications = this.resumeStore.publications;
    this.keywords = this.resumeStore.keywords;

    /**
     * Map a keyword (a category of skills) to a set of skill names.
     */
    this.skills = new Map();
    /**
     * given a name or alias, return the skill json
     */
    this.skillByName = new Map();
    /**
     * Key skills in a category by the keyword that they have in common.
     * "Hide" means don't show among the categories, but the
     * item can still show up under jobs.
     *
     * An alias does not need to have its own element in json.
     * But if you want something to show up as its own pill, it
     * needs its own json element.
     */

    /**
     * get category names sorted in the order they appear in the json
     */
    for (const skill of this.resumeStore.skills.filter((s) => !s.hide)) {
      for (const keyword of skill.keywords) {
        let skillCategory = this.skills.get(keyword);
        if (!skillCategory) {
          // if (!this.keywords.find((s) => s === keyword)) {
          //   // this.categories.push(`${keyword} [not in keywords list!]`);
          //   console.log(`!!! ${keyword} is not in keywords list!`);
          // }
          skillCategory = new Set<ISkill>();
          this.skills.set(keyword, skillCategory);
        }
        skillCategory.add(skill);
      }
    }

    /**
     * Key the skill element by its lowercase name and all its aliases.
     * If there is a circular reference here between
     * name and the alias, then what ever is the last one encountered
     * will be keyed by the duplicated skill name.
     */
    for (const skill of this.resumeStore.skills) {
      // will overwrite dups
      this.skillByName.set(skill.name.toLowerCase(), skill);
      const aliases = skill.aliases ?? [];
      /**
       * when the alias is referenced in a job, it will be
       * displayed using this skill.
       */
      for (const alias of aliases) {
        // will overwrite dups
        this.skillByName.set(alias.toLowerCase(), skill);
      }
    }
  }

  companySkills(company: ICompany): Array<ISkill> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return company.skills.map((name: string) => this.skillByName.get(name.toLowerCase())!);
  }

  // attaching() {
  //   ($('body') as any).scrollspy({ target: '#TOC', offset: 232 });

  //   $("#publications-list").on("show.bs.collapse", () => { this.showingPublications = true; });
  //   $("#publications-list").on("hide.bs.collapse", () => { this.showingPublications = false; });
  //   this.companies = this.companies
  //     .map((s, index) => {
  //       s.showingHighlights = false;
  //       $(`#highlights_${index}`).on("show.bs.collapse", () => { s.showingHighlights = true; });
  //       $(`#highlights_${index}`).on("hide.bs.collapse", () => { s.showingHighlights = false; });
  //       return s;
  //     });

  //   ($(".company .remote i") as any).tooltip();
  //   ($(".company .contract i") as any).tooltip();
  //   ($(".company .personal i") as any).tooltip();
  // }

  // private evaluateSkillPriority(a: number, b: number) {
  //     const factor = 1;
  //     /* whereever pririty is 0 or undefined, it goes last, otherwise is increasing */
  //     if (!a && !b) return -1;

  //     if (!a) return factor;
  //     if (!b) return -factor;

  //     return (a - b) * factor;
  // }

  // private evaluateString(a: string, b: string, factor: number) {
  //     if (!a && !b) return 0;

  //     if (!a) return -factor;
  //     if (!b) return factor;

  //     a = a.toLowerCase();
  //     b = b.toLowerCase();

  //     return a.localeCompare(b) * factor;
  // }

  private evaluateDateTime(valueA: string, valueB: string, factor: number) {
    // let a = this.moment.utc(valueA);
    // let b = this.moment.utc(valueB);

    valueA = valueA.replace(" (intermittent)", "");
    valueB = valueB.replace(" (intermittent)", "");

    if (valueA.startsWith("present")) {
      valueA = new Date().toDateString();
    }

    if (valueB.startsWith("present")) {
      valueB = new Date().toDateString();
    }

    const a = new Date(valueA).valueOf();
    const b = new Date(valueB).valueOf();

    if (!a && !b) return 0;

    if (!a) return -factor;
    if (!b) return factor;

    return (a - b) * factor;
  }
}
