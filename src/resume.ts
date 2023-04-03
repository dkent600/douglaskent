/* eslint-disable @typescript-eslint/no-explicit-any */
const resumeJson = (await import("./static/resume.json"));

export class Resume {
  content: HTMLElement;
  basics: any;
  profiles: Array<any>;
  companies: Array<any>;
  schools: Array<any>;
  languages: Array<any>;
  citizenship: Array<any>;
  skills: Map<string, Set<string>>;
  skillByName: Map<string, any>;
  testimonials: Array<any>;
  accomplishments: Array<string>;
  qualities: Array<string>;
  publications: Array<any>;
  showingPublications = false;
  categories: Array<string>;

  async activate() {

    this.basics = resumeJson.basics;
    this.languages = resumeJson.languages;
    this.profiles = resumeJson.basics.profiles;
    this.citizenship = resumeJson.citizenship;
    this.companies = resumeJson.work
      .sort((a, b) => { return this.evaluateDateTime(a.endDate, b.endDate, -1); });
    const schools = resumeJson.education;
    this.schools = schools.sort((a, b) => { return this.evaluateDateTime(a.startDate, b.startDate, -1); });
    this.testimonials = resumeJson.references;
    this.accomplishments = resumeJson.accomplishments;
    this.qualities = resumeJson.qualities;
    this.publications = resumeJson.publications;
    this.categories = resumeJson.keywords;

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
    for (const skill of resumeJson.skills.filter((s) => !s.hide)
    ) {
      for (const keyword of skill.keywords) {
        let skillCategory = this.skills.get(keyword);
        if (!skillCategory) {
          if (!this.categories.find((s) => s === keyword)) {
            // this.categories.push(`${keyword} [not in keywords list!]`);
            console.log(`!!! ${keyword} is not in keywords list!`);
          }
          skillCategory = new Set<string>();
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
    for (const skill of resumeJson.skills) {
      // will overwrite dups
      this.skillByName.set(skill.name.toLowerCase(), skill);
      const aliases = skill.aliases || [];
      /**
       * when the alias is referenced in a job, it will be
       * displayed using this skill.
       */
      for (const alias of aliases) {
        // will overwrite dups
        this.skillByName.set(alias.toLowerCase(), skill);
      }
    }

    for (const company of this.companies) {
      if (!company.skills) {
        console.log(`!!! company has no skills: ${company.name}`);
        continue;
      }
      company.skills = company.skills
        .map((name) => this.skillByName.get(name.toLowerCase()))
        ;
    }
  }

  attached() {
    $('body').scrollspy({ target: '#TOC', offset: 232 });

    $("#publications-list").on("show.bs.collapse", () => { this.showingPublications = true; });
    $("#publications-list").on("hide.bs.collapse", () => { this.showingPublications = false; });
    this.companies = this.companies
      .map((s, index) => {
        s.showingHighlights = false;
        $(`#highlights_${index}`).on("show.bs.collapse", () => { s.showingHighlights = true; });
        $(`#highlights_${index}`).on("hide.bs.collapse", () => { s.showingHighlights = false; });
        return s;
      });

    $(".company .remote i").tooltip();
    $(".company .contract i").tooltip();
    $(".company .personal i").tooltip();
  }

  private evaluateSkillPriority(a: number, b: number) {
    const factor = 1;
    /* whereever pririty is 0 or undefined, it goes last, otherwise is increasing */
    if (!a && !b) return -1;

    if (!a) return factor;
    if (!b) return -factor;

    return (a - b) * factor;
  }

  private evaluateString(a: string, b: string, factor: number) {
    if (!a && !b) return 0;

    if (!a) return -factor;
    if (!b) return factor;

    a = a.toLowerCase();
    b = b.toLowerCase();

    return a.localeCompare(b) * factor;
  }

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
