import produce from "immer";
import { getCurrentPage, getCurrentPageIndex } from "./page-selector";
import { ApplicationState } from "../application";
import {
  AddPageAction,
  add_on_current,
  add_on_root,
  DuplicateCurrentPageAction,
  IAddPageAction,
  PageAction,
  PageRoot,
  PageRootKey,
  RenameCurrentPageAction,
  SelectPageAction,
} from "./page-action";
import { Page, PageReference, parentPageIdToString } from "@core/model";
import { nanoid } from "nanoid";
import { UnconstrainedTemplate } from "@boring.so/template-provider";
import {
  BoringDocument,
  BoringTitleLike,
  boringTitleLikeAsBoringTitle,
  EmptyDocument,
} from "@boring.so/document-model";

// store
import { PageStore } from "@core/store";
import { setSelectedPage } from "@core/store/application";
import { movementDiff } from "treearray";

export const createPage = (
  pages: PageReference[],
  selectedPage: string,
  params: IAddPageAction
): Page => {
  const { name, initial, parent } = params;
  // todo - handle content initialization

  let title: BoringTitleLike = name;
  let document: BoringDocument;
  // let content: BoringContent = undefined;
  if (initial instanceof UnconstrainedTemplate) {
    const _r = initial.render();
    title = _r.title;
    document = new BoringDocument({
      title: boringTitleLikeAsBoringTitle(_r.title),
      content: _r.content,
    });
    // content = _r.content;
  } else {
    document = new EmptyDocument();
  }

  let linkparent: string;
  switch (parent) {
    case add_on_current:
      linkparent = selectedPage;
      break;
    case add_on_root:
    case PageRootKey:
    case PageRoot:
      linkparent = PageRootKey;
      break;
    default:
      linkparent = parent as string;
      break;
  }

  const id = nanoid();
  const newPage = produce<Page>(
    {
      id: id,
      type: "boring-document",
      name: name,
      sort: (() => {
        const last = pages
          .filter((p) => p.parent === linkparent)
          .sort((a, b) => a.sort - b.sort)
          .pop();
        return last?.sort ?? 0 + 1;
      })(), // sort = parent.children => lowestSort + 1
      document: document,
      parent: linkparent,
    },
    (page) => {
      return page;
    }
  );

  // todo: incomplete save operation
  new PageStore().add(newPage);

  pages.push(newPage);
  return newPage;
};

export function pageReducer(
  state: ApplicationState,
  action: PageAction
): ApplicationState {
  switch (action.type) {
    case "select-page": {
      const { page } = <SelectPageAction>action;
      return produce(state, (draft) => {
        draft.selectedPage = action.page;
        setSelectedPage(page);
      });
    }
    case "add-page": {
      return produce(state, (draft) => {
        <AddPageAction>action;
        const newPage = createPage(draft.pages, draft.selectedPage, action);
        draft.selectedPage = newPage.id;
      });
    }
    case "rename-current-page": {
      const { name } = <RenameCurrentPageAction>action;
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;
        const page = pages[pageIndex];

        pages[pageIndex] = produce(page, (page) => {
          page.name = name || `Page ${pages.length + 1}`;
          return page;
        });
      });
    }
    case "duplicate-current-page": {
      <DuplicateCurrentPageAction>action;
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;
        const page = pages[pageIndex];

        const duplicatePage = produce<PageReference>(page, (page) => {
          page.id = nanoid();
          page.name = `${page.name} Copy`;

          return page;
        });

        pages.push(duplicatePage);
        draft.selectedPage = duplicatePage.id;
      });
    }
    case "delete-current-page": {
      const page = getCurrentPage(state);
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;

        pages.splice(pageIndex, 1);

        const newIndex = Math.max(pageIndex - 1, 0);
        draft.selectedPage = pages[newIndex].id;
      });
    }
    case "move-page": {
      const { originOrder, targetOrder, originParent, targetParent } = action;

      console.log(action);
      return produce(state, (draft) => {
        const _id = getCurrentPage(state).id; // since it needs to be selected inorder to move (in case: movement by user)
        const movingPage = draft.pages.find((p) => p.id === _id);
        const prevs = draft.pages.filter((p) => p.parent === originParent);
        const posts = draft.pages.filter((p) => p.parent === targetParent);
        const diff = movementDiff({
          options: {
            bigstep: 1000,
          },
          item: movingPage,
          prevgroup: {
            id: parentPageIdToString(originParent),
            children: prevs,
          },
          postgroup: {
            id: parentPageIdToString(targetParent),
            children: posts,
          },
          prevorder: originOrder,
          postorder: targetOrder,
        });

        movingPage.parent = diff.post.moved.targetParent;
        movingPage.sort = diff.post.moved.sort;
        diff.post.updates.forEach((u) => {
          draft.pages.find((p) => p.id == u.id).sort = u.sort;
        });
      });
    }
    default:
      return state;
  }
}
