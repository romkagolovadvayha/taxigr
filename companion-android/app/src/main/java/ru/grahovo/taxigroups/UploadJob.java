package ru.grahovo.taxigroups;
import android.app.job.JobParameters;
import android.app.job.JobService;

public final class UploadJob extends JobService {
    @Override public boolean onStartJob(JobParameters params){ Api.EXECUTOR.execute(()->jobFinished(params,!Api.drain(getApplicationContext())));return true; }
    @Override public boolean onStopJob(JobParameters params){return true;}
}
