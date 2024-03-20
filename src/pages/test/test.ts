import { customElement } from "aurelia";
import view from './test.html';
import { Test1 } from '../test1/test1';
import { Resume } from '../resume/resume';
import { route } from "@aurelia/router-lite";

@route({
  routes: [
    {
      path: ['test1'],
      component: Test1,
      title: 'Douglas Kent',
    }
    ,
    {
      path: ['', 'resume/:short?'],
      component: Resume,
      title: 'Douglas Kent II',
    }
    ,
    {
      path: ['shortresume'],
      redirectTo: 'resume/short',
    }
  ]
})
@customElement({
    name: 'test',
    template: view
  })
  export class Test {
    binding() {
      $("#splash").css("display", "none");
    }  
  }