import * as github from '@actions/github';
import * as core from '@actions/core';

export async function postOrUpdatePRComment(
  token: string,
  commentBody: string
): Promise<void> {
  const context = github.context;
  const prNumber = context.payload.pull_request?.number;

  if (!prNumber) {
    core.info('Not running inside a Pull Request event. Skipping PR comment.');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;

  const COMMENT_SIGNATURE = '## 🛡️ Soroban Guard — Smart Contract Security & Gas Report';

  try {
    // List existing comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    const existingComment = comments.find((c) =>
      c.body?.includes(COMMENT_SIGNATURE)
    );

    if (existingComment) {
      core.info(`Updating existing Soroban Guard comment ID: ${existingComment.id}`);
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
    } else {
      core.info(`Creating new Soroban Guard comment on PR #${prNumber}`);
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
    }
  } catch (error: any) {
    core.warning(`Failed to post PR comment: ${error.message}`);
  }
}
